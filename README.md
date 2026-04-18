# ImmortalWrt - MT798x

```
This repository is worked on ImmortalWrt with MTK OpenWrt Feeds patches imported.
```

## Commit Cutoff Revisions

### ImmortalWrt: [62bd6b3](https://github.com/immortalwrt/immortalwrt/commit/62bd6b3625b47308343252e7875107a8bd665765) - OpenWrt 25.12 SNAPSHOT

```
Merge Official Source

Signed-off-by: Tianling Shen <cnsztl@immortalwrt.org>
```

### MTK OpenWrt Feeds: [79b79ec](https://git01.mediatek.com/plugins/gitiles/openwrt/feeds/mtk-openwrt-feeds/+/79b79ece6267ea64db5dab853d4576d9b9c11889)

```
[][kernel][common][eth][Refactor the check condition from PSE_FC to GDM_RXFC in the QDMA Tx hang monitor]

[Description]
Refactor the check condition from PSE_FC to GDM_RXFC in the QDMA Tx hang
monitor.

Some abnormal devices may send a large number of pause frames to the
DUT, causing the DUT to repeatedly trigger NETSYS SER if the PSE always
remains in the flow control condition.

[Root Cause]
PSE_FC status does not accurately reflect the actual state if the flow
control status does not change from OFF to ON.

[Solution]
Change the QDMA Tx hang check condition from PSE_FC to GDM_RXFC.

[How to Verify]
1. Perform the unbalanced PHY rate test to allow the traffic to occupy
   many PSE pages.
2. Sending a large number of pause frames to the DUT.

[Info to Customer]
N/A


Change-Id: I17e832fe84cf03087a12458bcf50fa1532b45de0
Reviewed-on: https://gerrit.mediatek.inc/c/openwrt/feeds/mtk_openwrt_feeds/+/11959632
```

### l1parser: [081bb31](https://github.com/chasey-dev/l1parser/commit/081bb31211efc74594d25bfd1bb5811f3408a205)

```
feat(ucode): add get all device map support
```
## About External Devices HNAT
> [!WARNING]
> Current HNAT support for external devices is basic and lack of complete test for various types. Please use with caution.

> [!IMPORTANT]
> Please keep interface `rxppd` in your bridge device (e.g. `br-lan`) while using external device HNAT.

### Support Matrix:
|               |  Ext as WAN   | Ext as LAN                |
|   :----:      |   :----:      | :----:                    |
|  **Ethernet** |      ✔️       |   ❌                     |
| **AP/ApCli**  |      ✔️       |   ⚠️(**Untested**)       |

## Acknowledgements
HNAT support for external devices is adapted from [Padavanonly's repo](https://github.com/padavanonly/immortalwrt-mt798x-6.6). 