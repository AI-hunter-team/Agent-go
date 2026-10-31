/** Internal preview opt-in; preserve the integrated detail generator default until visual acceptance. */
export function previewWorldVersion():"metro-v1"|"metro-v2"|"metro-v3" {
 const value=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("worldgen"):null;
 return value==="v3"?"metro-v3":value==="v1"?"metro-v1":"metro-v2";
}
