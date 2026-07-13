use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyQuota {
    used_percent: u8,
    window_duration_mins: u64,
    resets_at: Option<u64>,
    reset_credits_available: Option<u32>,
    synced: bool,
    synced_at: String,
    source: &'static str,
}

#[tauri::command]
pub fn get_weekly_quota() -> Result<WeeklyQuota, String> {
    let mut child = start_app_server()?;
    let mut stdin = child.stdin.take().ok_or("无法连接 Codex App Server 输入流")?;
    let stdout = child.stdout.take().ok_or("无法连接 Codex App Server 输出流")?;

    let messages = [
        json!({
            "method": "initialize",
            "id": 0,
            "params": {
                "clientInfo": {
                    "name": "codex_weekly_quota",
                    "title": "Codex Weekly Quota",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }
        }),
        json!({"method": "initialized", "params": {}}),
        json!({"method": "account/rateLimits/read", "id": 2}),
    ];

    for message in messages {
        writeln!(stdin, "{message}").map_err(|error| format!("发送额度请求失败：{error}"))?;
    }
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(message) = serde_json::from_str::<Value>(&line) {
                if message.get("id").and_then(Value::as_u64) == Some(2) {
                    let _ = sender.send(message);
                    break;
                }
            }
        }
    });

    // Keep stdin alive until the matching response arrives. Closing it here sends EOF and can
    // make app-server exit before it flushes the rate-limit response in packaged builds.
    let response = receiver
        .recv_timeout(Duration::from_secs(12))
        .map_err(|_| "读取 Codex 周额度超时，请确认已登录 Codex".to_string());
    drop(stdin);
    let _ = child.kill();
    let response = response?;

    if let Some(error) = response.get("error") {
        return Err(format!("Codex 返回额度错误：{error}"));
    }

    parse_rate_limits(response.get("result").ok_or("Codex 响应缺少额度数据")?)
}

fn start_app_server() -> Result<Child, String> {
    let codex = find_codex_binary().ok_or(
        "找不到 Codex CLI。请安装 Codex，或通过 CODEX_PATH 指定可执行文件。",
    )?;

    Command::new(codex)
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("启动 Codex App Server 失败：{error}"))
}

fn find_codex_binary() -> Option<PathBuf> {
    if let Some(path) = env::var_os("CODEX_PATH").map(PathBuf::from) {
        if path.is_file() {
            return Some(path);
        }
    }

    if let Some(path) = env::var_os("PATH").and_then(|paths| {
        env::split_paths(&paths)
            .map(|directory| directory.join(if cfg!(windows) { "codex.exe" } else { "codex" }))
            .find(|candidate| candidate.is_file())
    }) {
        return Some(path);
    }

    #[cfg(target_os = "macos")]
    {
        let bundled = PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex");
        if bundled.is_file() {
            return Some(bundled);
        }
    }

    None
}

fn parse_rate_limits(result: &Value) -> Result<WeeklyQuota, String> {
    let mut windows = Vec::new();

    if let Some(snapshot) = result.get("rateLimits") {
        collect_windows(snapshot, &mut windows);
    }
    if let Some(snapshots) = result.get("rateLimitsByLimitId").and_then(Value::as_object) {
        for snapshot in snapshots.values() {
            collect_windows(snapshot, &mut windows);
        }
    }

    let selected = windows
        .into_iter()
        .max_by_key(|window| window.1)
        .ok_or("当前账号没有返回可显示的 Codex 额度窗口")?;

    let reset_credits_available = result
        .pointer("/rateLimitResetCredits/availableCount")
        .and_then(Value::as_u64)
        .map(|count| count.min(u32::MAX as u64) as u32);

    Ok(WeeklyQuota {
        used_percent: selected.0.min(100) as u8,
        window_duration_mins: selected.1,
        resets_at: selected.2,
        reset_credits_available,
        synced: true,
        synced_at: unix_now().to_string(),
        source: "codex-app-server",
    })
}

fn collect_windows(snapshot: &Value, output: &mut Vec<(u64, u64, Option<u64>)>) {
    for key in ["primary", "secondary"] {
        if let Some(window) = snapshot.get(key).filter(|value| !value.is_null()) {
            if let (Some(used), Some(duration)) = (
                window.get("usedPercent").and_then(Value::as_u64),
                window.get("windowDurationMins").and_then(Value::as_u64),
            ) {
                output.push((
                    used,
                    duration,
                    window.get("resetsAt").and_then(Value::as_u64),
                ));
            }
        }
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
