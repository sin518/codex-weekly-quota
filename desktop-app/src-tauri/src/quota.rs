use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

const FIVE_HOUR_WINDOW_MINS: u64 = 300;
const WEEKLY_WINDOW_MINS: u64 = 10_080;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindow {
    used_percent: u8,
    window_duration_mins: u64,
    resets_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSnapshot {
    five_hour: Option<QuotaWindow>,
    weekly: QuotaWindow,
    reset_credits_available: Option<u32>,
    synced_at: u64,
    source: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaReadError {
    code: &'static str,
    detail: String,
}

impl QuotaReadError {
    fn new(code: &'static str, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }
}

#[tauri::command]
pub fn get_codex_quota() -> Result<QuotaSnapshot, QuotaReadError> {
    let mut child = start_app_server()?;
    let mut stdin = child.stdin.take().ok_or_else(|| {
        QuotaReadError::new(
            "app-server-unavailable",
            "无法连接 Codex App Server 输入流",
        )
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        QuotaReadError::new(
            "app-server-unavailable",
            "无法连接 Codex App Server 输出流",
        )
    })?;

    let messages = [
        json!({
            "method": "initialize",
            "id": 0,
            "params": {
                "clientInfo": {
                    "name": "codex_quota_overlay",
                    "title": "Codex Quota Overlay",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }
        }),
        json!({"method": "initialized", "params": {}}),
        json!({"method": "account/rateLimits/read", "id": 2}),
    ];

    for message in messages {
        writeln!(stdin, "{message}").map_err(|error| {
            QuotaReadError::new(
                "app-server-unavailable",
                format!("发送额度请求失败：{error}"),
            )
        })?;
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
        .map_err(|_| QuotaReadError::new("quota-read-timeout", "读取 Codex 额度超时"));
    drop(stdin);
    let _ = child.kill();
    let response = response?;

    if let Some(error) = response.get("error") {
        let detail = error.to_string();
        let normalized = detail.to_lowercase();
        let code = if normalized.contains("unauthorized")
            || normalized.contains("not logged")
            || normalized.contains("login")
            || normalized.contains("authentication")
        {
            "not-signed-in"
        } else {
            "quota-response-error"
        };
        return Err(QuotaReadError::new(code, detail));
    }

    parse_rate_limits(response.get("result").ok_or_else(|| {
        QuotaReadError::new("quota-response-missing", "Codex 响应缺少额度数据")
    })?)
}

fn start_app_server() -> Result<Child, QuotaReadError> {
    let codex = find_codex_binary().ok_or_else(|| {
        QuotaReadError::new(
            "codex-cli-missing",
            "找不到 Codex CLI。请安装 Codex，或通过 CODEX_PATH 指定可执行文件。",
        )
    })?;

    Command::new(codex)
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            QuotaReadError::new(
                "app-server-unavailable",
                format!("启动 Codex App Server 失败：{error}"),
            )
        })
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

fn parse_rate_limits(result: &Value) -> Result<QuotaSnapshot, QuotaReadError> {
    let snapshot = match result.get("rateLimits") {
        Some(snapshot) if !snapshot.is_null() => snapshot,
        _ => result
            .pointer("/rateLimitsByLimitId/codex")
            .filter(|snapshot| !snapshot.is_null())
            .ok_or_else(|| {
                QuotaReadError::new(
                    "weekly-window-missing",
                    "Codex 未返回顶层额度或 codex 明细额度",
                )
            })?,
    };

    // The five-hour window is optional during rollout so existing weekly-only accounts keep
    // working. The weekly window remains required because it is the overlay's baseline data.
    let five_hour = parse_window(
        snapshot,
        FIVE_HOUR_WINDOW_MINS,
        "五小时",
        "five-hour-window-ambiguous",
    )?;
    let weekly = parse_window(
        snapshot,
        WEEKLY_WINDOW_MINS,
        "七天",
        "weekly-window-ambiguous",
    )?
    .ok_or_else(|| {
        QuotaReadError::new(
            "weekly-window-missing",
            "Codex 未返回 10080 分钟额度窗口",
        )
    })?;

    let reset_credits_available = result
        .pointer("/rateLimitResetCredits/availableCount")
        .and_then(Value::as_u64)
        .and_then(|count| u32::try_from(count).ok());

    Ok(QuotaSnapshot {
        five_hour,
        weekly,
        reset_credits_available,
        synced_at: unix_now(),
        source: "codex-app-server",
    })
}

fn parse_window(
    snapshot: &Value,
    duration_mins: u64,
    label: &str,
    ambiguous_code: &'static str,
) -> Result<Option<QuotaWindow>, QuotaReadError> {
    let matching_windows = ["primary", "secondary"]
        .into_iter()
        .filter_map(|key| snapshot.get(key))
        .filter(|window| !window.is_null())
        .filter(|window| {
            window
                .get("windowDurationMins")
                .and_then(Value::as_u64)
                == Some(duration_mins)
        })
        .collect::<Vec<_>>();

    let selected = match matching_windows.as_slice() {
        [] => return Ok(None),
        [selected] => *selected,
        _ => {
            return Err(QuotaReadError::new(
                ambiguous_code,
                format!("Codex 返回了多个 {duration_mins} 分钟额度窗口"),
            ));
        }
    };

    let used_percent = selected
        .get("usedPercent")
        .and_then(Value::as_u64)
        .filter(|used| *used <= 100)
        .ok_or_else(|| {
            QuotaReadError::new(
                "quota-data-invalid",
                format!("{label}额度窗口缺少 0 到 100 范围内的 usedPercent"),
            )
        })?;

    Ok(Some(QuotaWindow {
        used_percent: used_percent as u8,
        window_duration_mins: duration_mins,
        resets_at: selected.get("resetsAt").and_then(Value::as_u64),
    }))
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(used_percent: u64, duration_mins: u64, resets_at: Option<u64>) -> Value {
        json!({
            "usedPercent": used_percent,
            "windowDurationMins": duration_mins,
            "resetsAt": resets_at,
        })
    }

    fn five_hour_window(used_percent: u64, resets_at: Option<u64>) -> Value {
        window(used_percent, FIVE_HOUR_WINDOW_MINS, resets_at)
    }

    fn weekly_window(used_percent: u64, resets_at: Option<u64>) -> Value {
        window(used_percent, WEEKLY_WINDOW_MINS, resets_at)
    }

    #[test]
    fn selects_both_top_level_windows() {
        let result = json!({
            "rateLimits": {
                "primary": five_hour_window(10, Some(1_000)),
                "secondary": weekly_window(68, Some(2_000)),
            },
            "rateLimitsByLimitId": {
                "codex": {
                    "secondary": weekly_window(99, Some(3_000)),
                }
            },
            "rateLimitResetCredits": {
                "availableCount": 0,
            }
        });

        let quota = parse_rate_limits(&result).expect("quota windows should parse");

        assert_eq!(quota.five_hour.expect("five-hour window").used_percent, 10);
        assert_eq!(quota.weekly.used_percent, 68);
        assert_eq!(quota.weekly.resets_at, Some(2_000));
        assert_eq!(quota.reset_credits_available, Some(0));
    }

    #[test]
    fn falls_back_to_codex_details_only_when_top_level_is_missing() {
        let result = json!({
            "rateLimitsByLimitId": {
                "codex": {
                    "primary": five_hour_window(17, Some(1_000)),
                    "secondary": weekly_window(42, Some(2_000)),
                },
                "other": {
                    "secondary": weekly_window(99, Some(3_000)),
                }
            }
        });

        let quota = parse_rate_limits(&result).expect("fallback weekly quota should parse");

        assert_eq!(quota.five_hour.expect("five-hour window").used_percent, 17);
        assert_eq!(quota.weekly.used_percent, 42);
    }

    #[test]
    fn does_not_fall_back_when_top_level_exists_without_a_weekly_window() {
        let result = json!({
            "rateLimits": {
                "primary": five_hour_window(10, Some(1_000))
            },
            "rateLimitsByLimitId": {
                "codex": {
                    "secondary": weekly_window(42, Some(2_000)),
                }
            }
        });

        let error = parse_rate_limits(&result).expect_err("top-level data must win");

        assert_eq!(error.code, "weekly-window-missing");
    }

    #[test]
    fn rejects_ambiguous_weekly_windows() {
        let result = json!({
            "rateLimits": {
                "primary": weekly_window(10, Some(1_000)),
                "secondary": weekly_window(20, Some(2_000)),
            }
        });

        let error = parse_rate_limits(&result).expect_err("ambiguous data must fail");

        assert_eq!(error.code, "weekly-window-ambiguous");
    }

    #[test]
    fn rejects_ambiguous_five_hour_windows() {
        let result = json!({
            "rateLimits": {
                "primary": five_hour_window(10, Some(1_000)),
                "secondary": five_hour_window(20, Some(2_000)),
            }
        });

        let error = parse_rate_limits(&result).expect_err("ambiguous data must fail");

        assert_eq!(error.code, "five-hour-window-ambiguous");
    }

    #[test]
    fn rejects_an_out_of_range_used_percent() {
        let result = json!({
            "rateLimits": {
                "secondary": weekly_window(125, Some(2_000)),
            }
        });

        let error = parse_rate_limits(&result).expect_err("invalid percentage must fail");

        assert_eq!(error.code, "quota-data-invalid");
    }

    #[test]
    fn rejects_an_invalid_five_hour_window() {
        let result = json!({
            "rateLimits": {
                "primary": five_hour_window(125, Some(1_000)),
                "secondary": weekly_window(68, Some(2_000)),
            }
        });

        let error = parse_rate_limits(&result).expect_err("invalid percentage must fail");

        assert_eq!(error.code, "quota-data-invalid");
    }

    #[test]
    fn keeps_weekly_usage_while_five_hour_window_is_rolling_out() {
        let result = json!({
            "rateLimits": {
                "secondary": weekly_window(68, Some(2_000)),
            }
        });

        let quota = parse_rate_limits(&result).expect("weekly-only data remains supported");

        assert!(quota.five_hour.is_none());
        assert_eq!(quota.weekly.used_percent, 68);
    }

    #[test]
    fn keeps_usage_when_reset_time_is_missing() {
        let result = json!({
            "rateLimits": {
                "secondary": weekly_window(68, None),
            }
        });

        let quota = parse_rate_limits(&result).expect("missing reset time is partial data");

        assert_eq!(quota.weekly.used_percent, 68);
        assert_eq!(quota.weekly.resets_at, None);
    }
}
