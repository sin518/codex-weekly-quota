import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(appDirectory, "..");
const targetDirectory = path.join(appDirectory, "src-tauri", "target");
const releasesDirectory = path.join(repositoryRoot, "releases");
const installerExtensions = [".dmg", ".pkg", ".msi", ".exe", ".appimage", ".deb", ".rpm"];

function isInstaller(filePath) {
  const normalizedPath = filePath.toLowerCase();
  const isInsideBundle = normalizedPath.includes(`${path.sep}bundle${path.sep}`);
  return isInsideBundle && installerExtensions.some((extension) => normalizedPath.endsWith(extension));
}

async function findInstallers(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const installers = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      installers.push(...await findInstallers(entryPath));
    } else if (entry.isFile() && isInstaller(entryPath)) {
      installers.push(entryPath);
    }
  }

  return installers;
}

await mkdir(releasesDirectory, { recursive: true });

let installers;
try {
  installers = await findInstallers(targetDirectory);
} catch (error) {
  if (error && error.code === "ENOENT") {
    throw new Error(`尚未找到 Tauri 构建目录：${targetDirectory}`);
  }
  throw error;
}

if (installers.length === 0) {
  throw new Error("构建已结束，但没有找到可复制的安装包。");
}

for (const installer of installers) {
  const destination = path.join(releasesDirectory, path.basename(installer));
  await copyFile(installer, destination);
  console.log(`已收集：${destination}`);
}

console.log(`完成：共 ${installers.length} 个安装包，目录 ${releasesDirectory}`);
