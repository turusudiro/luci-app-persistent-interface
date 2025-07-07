# See /LICENSE for more information.
# This is free software, licensed under the GNU General Public License v2.

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI for persistent-interface
LUCI_DESCRIPTION:=Keep interface name stable across reboots and hotplug.
LUCI_DEPENDS:=+luci-base +rpcd
PKG_VERSION:=1.0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature