/** New local worlds use V3. Explicit flags retain V1/V2 rollback without changing saved descriptors. */
export function previewWorldVersion():"metro-v1"|"metro-v2"|"metro-v3" {
 const value=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("worldgen"):null;
 return value==="v1"?"metro-v1":value==="v2"?"metro-v2":"metro-v3";
}
