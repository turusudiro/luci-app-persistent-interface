# luci-app-persistent-interface

This LuCI-based utility ensures **persistent interface naming** in OpenWrt by matching interfaces to specific MAC addresses during boot and hotplug events.

## 🔧 What It Does

- Renames network interfaces on **boot** and **hotplug** based on MAC address
- Executes custom logic **after successful renaming**
- Integrates with OpenWrt's `init.d` and `hotplug.d` system

## ✅ Compatibility

- Built with OpenWrt SDK **23.05**
- Tested on OpenWrt **24.10.2**
- Likely compatible with OpenWrt **21.02+** (relies on `ip`, `uci`, `rpcd`, and `menu.d`)

## 📦 Installation

Download the `.ipk` package from the [Releases](https://github.com/turusudiro/luci-app-persistent-interface/releases) page, then install it:

```bash
opkg install luci-app-persistent-interface.ipk
```
After installation, enable the init script to run on boot:
```bash
/etc/init.d/persistent-interface enable
