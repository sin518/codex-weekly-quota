use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

const KEYRING_SERVICE: &str = "com.sin.codexweeklyquota.deepseek";
const KEYRING_USER: &str = "api-key";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekBalanceInfo {
    currency: String,
    total_balance: String,
    granted_balance: String,
    topped_up_balance: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekBalance {
    is_available: bool,
    balances: Vec<DeepSeekBalanceInfo>,
    synced_at: u64,
    source: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekConfigStatus {
    configured: bool,
    base_url: Option<String>,
    remember_api_key: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeepSeekReadError {
    code: &'static str,
    detail: String,
}

impl DeepSeekReadError {
    fn new(code: &'static str, detail: impl Into<String>) -> Self {
        Self { code: code, detail: detail.into() }
    }
}

#[derive(Clone)]
struct DeepSeekConfig {
    base_url: String,
    api_key: String,
}

#[derive(Default)]
pub struct DeepSeekConfigState {
    config: Mutex<Option<DeepSeekConfig>>,
}

#[derive(Debug, Deserialize)]
struct RawBalanceResponse {
    is_available: bool,
    balance_infos: Vec<RawBalanceInfo>,
}

#[derive(Debug, Deserialize)]
struct RawBalanceInfo {
    currency: String,
    total_balance: String,
    granted_balance: String,
    topped_up_balance: String,
}

#[tauri::command]
pub async fn save_deepseek_config(
    state: State<'_, DeepSeekConfigState>,
    base_url: String,
    api_key: String,
    remember_api_key: bool,
) -> Result<DeepSeekBalance, DeepSeekReadError> {
    let base_url = normalize_base_url(&base_url)?;
    let api_key = api_key.trim().to_string();
    if api_key.is_empty() {
        return Err(DeepSeekReadError::new("deepseek-api-key-missing", "API Key 不能为空"));
    }

    let config = DeepSeekConfig { base_url: base_url.clone(), api_key: api_key.clone() };
    let balance = fetch_balance(&config).await?;
    let mut guard = state.config.lock().map_err(|_| DeepSeekReadError::new("deepseek-state-error", "配置状态锁失败"))?;
    *guard = Some(config.clone());
    drop(guard);

    if remember_api_key {

        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|error| DeepSeekReadError::new("deepseek-state-error", format!("打开钥匙串失败：{error}")))?;
        entry.set_password(&api_key)
            .map_err(|error| DeepSeekReadError::new("deepseek-state-error", format!("保存到钥匙串失败：{error}")))?;
    } else {
        let _ = clear_keyring();
    }

    Ok(balance)
}

#[tauri::command]
pub async fn get_deepseek_balance(
    state: State<'_, DeepSeekConfigState>,
    base_url: String,
) -> Result<DeepSeekBalance, DeepSeekReadError> {
    let base_url = normalize_base_url(&base_url)?;
    let api_key = resolve_api_key(&state, &base_url)?;
    fetch_balance(&DeepSeekConfig { base_url, api_key }).await
}

#[tauri::command]
pub fn get_deepseek_config_status(
    state: State<'_, DeepSeekConfigState>,
) -> Result<DeepSeekConfigStatus, DeepSeekReadError> {
    let guard = state.config.lock().map_err(|_| DeepSeekReadError::new("deepseek-state-error", "配置状态锁失败"))?;
    let memory_url = guard.as_ref().map(|config| config.base_url.clone());
    let remembered = has_remembered_key();
    let base_url = memory_url;
    Ok(DeepSeekConfigStatus {
        configured: base_url.is_some() || remembered,
        base_url,
        remember_api_key: remembered,
    })
}

#[tauri::command]
pub fn clear_deepseek_config(
    state: State<'_, DeepSeekConfigState>,
) -> Result<(), DeepSeekReadError> {
    let mut guard = state.config.lock().map_err(|_| DeepSeekReadError::new("deepseek-state-error", "配置状态锁失败"))?;
    *guard = None;
    drop(guard);
    let _ = clear_keyring();
    Ok(())
}

fn resolve_api_key(state: &DeepSeekConfigState, base_url: &str) -> Result<String, DeepSeekReadError> {
    {
        let guard = state.config.lock().map_err(|_| DeepSeekReadError::new("deepseek-state-error", "配置状态锁失败"))?;
        if let Some(config) = guard.as_ref() {
            if config.base_url == base_url {
                return Ok(config.api_key.clone());
            }
        }
    }

    match keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).and_then(|entry| entry.get_password()) {
        Ok(key) => Ok(key),
        Err(_) => Err(DeepSeekReadError::new("deepseek-not-configured", "尚未配置 DeepSeek API Key")),
    }
}

fn clear_keyring() -> Result<(), ()> {
    match keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        Ok(entry) => match entry.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(()),
        },
        Err(_) => Err(()),
    }
}

fn has_remembered_key() -> bool {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .and_then(|entry| entry.get_password())
        .is_ok()
}

fn normalize_base_url(raw: &str) -> Result<String, DeepSeekReadError> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(DeepSeekReadError::new("deepseek-invalid-url", "URL 不能为空"));
    }
    let parsed = reqwest::Url::parse(trimmed)
        .map_err(|_| DeepSeekReadError::new("deepseek-invalid-url", "URL 格式无效"))?;
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(DeepSeekReadError::new("deepseek-invalid-url", "URL 不能包含用户名或密码"));
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(DeepSeekReadError::new("deepseek-invalid-url", "URL 不能包含 query 或 fragment"));
    }

    let is_https = parsed.scheme() == "https";
    let is_loopback = parsed.scheme() == "http"
        && parsed.host_str().map(is_loopback_host).unwrap_or(false);
    if !is_https && !is_loopback {
        return Err(DeepSeekReadError::new("deepseek-invalid-url", "仅支持 https 或本机 http"));
    }
    Ok(trimmed.to_string())
}

fn is_loopback_host(host: &str) -> bool {
    host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]"
}

async fn fetch_balance(config: &DeepSeekConfig) -> Result<DeepSeekBalance, DeepSeekReadError> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| DeepSeekReadError::new("deepseek-network-error", format!("创建请求失败：{error}")))?;

    let url = if config.base_url.ends_with("/user/balance") {
        config.base_url.clone()
    } else {
        format!("{}/user/balance", config.base_url)
    };

    let response = client
        .get(&url)
        .bearer_auth(&config.api_key)
        .send()
        .await
        .map_err(|error| DeepSeekReadError::new("deepseek-network-error", format!("连接 DeepSeek 失败：{error}")))?;

    let status = response.status();
    if !status.is_success() {
        let code = if status.as_u16() == 401 || status.as_u16() == 403 {
            "deepseek-auth-error"
        } else {
            "deepseek-http-error"
        };
        return Err(DeepSeekReadError::new(code, format!("DeepSeek 返回 HTTP {status}")));
    }

    let raw: RawBalanceResponse = response.json().await
        .map_err(|error| DeepSeekReadError::new("deepseek-response-error", format!("解析 DeepSeek 响应失败：{error}")))?;

    if raw.balance_infos.is_empty() {
        return Err(DeepSeekReadError::new("deepseek-balance-missing", "DeepSeek 未返回余额数据"));
    }

    let balances = raw.balance_infos
        .into_iter()
        .map(|info| DeepSeekBalanceInfo {
            currency: info.currency,
            total_balance: info.total_balance,
            granted_balance: info.granted_balance,
            topped_up_balance: info.topped_up_balance,
        })
        .collect();

    Ok(DeepSeekBalance {
        is_available: raw.is_available,
        balances,
        synced_at: unix_now(),
        source: "deepseek-api",
    })
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
