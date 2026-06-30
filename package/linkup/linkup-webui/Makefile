include $(TOPDIR)/rules.mk

PKG_NAME:=linkup-webui
PKG_VERSION:=1.0
PKG_RELEASE:=1
PKG_MAINTAINER:=SuperKali <hello@superkali.me>
PKG_LICENSE:=GPL-2.0
PKG_BUILD_DEPENDS:=node/host

# Vue3 SPA source lives in ./web (no upstream tarball).
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

define Package/linkup-webui
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LinkUp OS web UI (Vue SPA)
  DEPENDS:=+linkup-rpcd +uhttpd +uhttpd-mod-ubus +rpcd-mod-luci +rpcd-mod-iwinfo +cgi-io
  PKGARCH:=all
endef

define Package/linkup-webui/description
  GL.iNet-style Vue3 single-page web UI for the LinkUp OS 5G CPE. The static
  dist is built from the ./web Vue project with Vite during the firmware build
  (node/host) and served by uhttpd at /linkup/. Talks JSON-RPC to the linkup.*
  rpcd objects. Enables the uhttpd /ubus endpoint and redirects / -> /linkup/
  on first boot.
endef

# Copy the local Vue project into the build dir (no tarball fetch).
define Build/Prepare
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) ./web/. $(PKG_BUILD_DIR)/
endef

# Host-side build: npm ci (from package-lock) then vite build -> ./dist.
# node/host puts node+npm in PATH. Pure-frontend output, PKGARCH:=all.
define Build/Compile
	cd $(PKG_BUILD_DIR) && \
		npm_config_cache=$(TMP_DIR)/npm-cache-$(PKG_NAME) \
		npm ci --no-audit --no-fund --prefer-offline && \
		npm run build
endef

define Package/linkup-webui/install
	$(INSTALL_DIR) $(1)/www/linkup
	$(CP) $(PKG_BUILD_DIR)/dist/. $(1)/www/linkup/
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/40-linkup-webui $(1)/etc/uci-defaults/
endef

$(eval $(call BuildPackage,linkup-webui))
