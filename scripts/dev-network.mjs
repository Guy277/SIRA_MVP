// What a phone on the same Wi-Fi needs to reach the dev PC: its local IPv4 addresses,
// the Windows network profile (Public blocks incoming connections), and whether
// mobile/.env sends the app somewhere else. Used by start-dev-stack.mjs and dev-tunnel.mjs.
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Virtual adapters (Hyper-V, WSL, VirtualBox, VMware, Docker, VPN…) are not the Wi-Fi.
const VIRTUAL = /vEthernet|WSL|VirtualBox|VMware|Hyper-V|Docker|Loopback|Bluetooth|Tailscale|ZeroTier|Npcap|TAP|VPN/i;

// On Windows a virtual adapter can have a plain name (« Ethernet 2 » for VirtualBox):
// its description tells what it is.
function windowsVirtualAdapters() {
  if (process.platform !== "win32") return new Set();
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "Get-NetAdapter -IncludeHidden | Select-Object Name, InterfaceDescription | ConvertTo-Json -Compress",
  ], { encoding: "utf8", timeout: 10_000 });
  if (result.error || result.status !== 0 || !result.stdout.trim()) return new Set();
  try {
    const parsed = JSON.parse(result.stdout);
    return new Set((Array.isArray(parsed) ? parsed : [parsed]).filter((adapter) => VIRTUAL.test(adapter.InterfaceDescription ?? "")).map((adapter) => adapter.Name));
  } catch {
    return new Set();
  }
}

export function localIPv4s() {
  const found = [];
  const virtual = windowsVirtualAdapters();
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (VIRTUAL.test(name) || virtual.has(name)) continue;
    for (const address of addresses ?? []) {
      const ipv4 = address.family === "IPv4" || address.family === 4;
      if (!ipv4 || address.internal || address.address.startsWith("127.") || address.address.startsWith("169.254.")) continue;
      found.push({ name, address: address.address });
    }
  }
  return found;
}

// Windows only: networks set to « Public », where the firewall blocks the phone.
export function publicWindowsNetworks() {
  if (process.platform !== "win32") return [];
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "Get-NetConnectionProfile | Select-Object InterfaceAlias, Name, @{n='Category';e={[string]$_.NetworkCategory}} | ConvertTo-Json -Compress",
  ], { encoding: "utf8", timeout: 10_000 });
  if (result.error || result.status !== 0 || !result.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((profile) => profile.Category === "Public");
  } catch {
    return [];
  }
}

// EXPO_PUBLIC_API_URL written in mobile/.env: the app would call that address, not this PC.
export function mobileEnvApiUrl(root) {
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    const path = join(root, "mobile", file);
    if (!existsSync(path)) continue;
    const line = readFileSync(path, "utf8").split(/\r?\n/).find((entry) => /^\s*EXPO_PUBLIC_API_URL\s*=/.test(entry));
    const value = line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    if (value) return { file: `mobile/${file}`, value };
  }
  return null;
}

// The lines printed by dev:stack for testing on a phone.
export function phoneAccessNotes(root, { appPort = 8081, apiPort = 4000 } = {}) {
  const notes = [];
  const addresses = localIPv4s();
  if (!addresses.length) {
    notes.push("Aucune adresse Wi-Fi/Ethernet trouvée : le téléphone ne pourra pas joindre ce PC (connecte-le au même réseau).");
  }
  for (const { name, address } of addresses) {
    notes.push(`Sur téléphone (même Wi-Fi, ${name}) : http://${address}:${appPort}`);
    notes.push(`Test API depuis le téléphone : http://${address}:${apiPort}/api/v1/health`);
  }
  notes.push("Micro et GPS : HTTPS nécessaire -> npm run dev:tunnel, ou l'appli Expo Go (QR code)");
  const blocked = publicWindowsNetworks();
  if (blocked.length) {
    const names = blocked.map((profile) => profile.Name || profile.InterfaceAlias).join(", ");
    notes.push(`ATTENTION Réseau en Public (${names}) : le téléphone sera bloqué. Passe-le en Privé ou lance scripts\\windows\\autoriser-telephone.ps1 (en administrateur).`);
  }
  const configured = mobileEnvApiUrl(root);
  if (configured) {
    notes.push(`ATTENTION ${configured.file} contient EXPO_PUBLIC_API_URL=${configured.value} : l'appli appellera cette adresse au lieu de ce PC.`);
  }
  return notes;
}
