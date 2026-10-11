include $(TOPDIR)/rules.mk

PKG_NAME:=deepseek-harness
PKG_VERSION:=0.2.0-rc.2
PKG_RELEASE:=2
PKG_LICENSE:=MIT
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

# Copy this entire adapter directory into SDK/package/deepseek-harness.
# Pass DSH_PAYLOAD_DIR as the absolute path to the matching musl payload.
define Package/deepseek-harness
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=DeepSeek Harness native service
  URL:=https://github.com/jmjFortune/dsh-ipk
  DEPENDS:=@(x86_64||aarch64) +bash +ca-bundle +git-http +libubox +procd
endef

define Package/luci-app-deepseek-harness
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI configuration for DeepSeek Harness
  DEPENDS:=+deepseek-harness +luci-base +rpcd
  PKGARCH:=all
endef

define Build/Prepare
	test -n "$(DSH_PAYLOAD_DIR)"
	test -f "$(DSH_PAYLOAD_DIR)/runtime/bin/node"
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) $(DSH_PAYLOAD_DIR)/build-info.json $(PKG_BUILD_DIR)/
	tar -czf $(PKG_BUILD_DIR)/payload.tar.gz -C $(DSH_PAYLOAD_DIR) .
endef

define Build/Configure
endef

define Build/Compile
	python3 -c 'import json; d=json.load(open("$(PKG_BUILD_DIR)/build-info.json")); assert d["libc"] == "musl" and d["arch"] == {"x86_64":"x64","aarch64":"arm64"}["$(ARCH)"] and d["dsh"] == "$(PKG_VERSION)"'
endef

define Package/deepseek-harness/conffiles
/etc/config/deepseek-harness
endef

define Package/deepseek-harness/install
	$(CP) ./files/. $(1)/
	chmod 600 $(1)/etc/config/deepseek-harness
	$(INSTALL_DIR) $(1)/usr/lib/deepseek-harness
	$(CP) $(PKG_BUILD_DIR)/payload.tar.gz $(1)/usr/lib/deepseek-harness/
	$(INSTALL_BIN) ./control/postinst $(1)/usr/lib/deepseek-harness/postinst
	$(INSTALL_BIN) ./control/prerm $(1)/usr/lib/deepseek-harness/prerm
endef

define Package/deepseek-harness/postinst
#!/bin/sh
[ -z "$${IPKG_INSTROOT:-}" ] || exit 0
/usr/lib/deepseek-harness/postinst
endef

define Package/deepseek-harness/prerm
#!/bin/sh
[ -z "$${IPKG_INSTROOT:-}" ] || exit 0
/usr/lib/deepseek-harness/prerm
endef

define Package/deepseek-harness/postrm
#!/bin/sh
[ -z "$${IPKG_INSTROOT:-}" ] || exit 0
[ "$$1" = remove ] || exit 0
rm -rf /usr/lib/deepseek-harness
endef

define Package/luci-app-deepseek-harness/install
	$(INSTALL_DIR) $(1)/www
	$(CP) ./luci/htdocs/. $(1)/www/
	$(CP) ./luci/usr $(1)/
endef

define Package/luci-app-deepseek-harness/postinst
#!/bin/sh
[ -z "$${IPKG_INSTROOT:-}" ] || exit 0
touch /www/luci-static/resources/view/deepseek-harness/config.js \
    /www/luci-static/resources/view/deepseek-harness/config.css
/etc/init.d/rpcd reload
endef

$(eval $(call BuildPackage,deepseek-harness))
$(eval $(call BuildPackage,luci-app-deepseek-harness))
