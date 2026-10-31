import { afterEach,expect,test,vi } from "vitest";
import { previewWorldVersion } from "../src/ui/worldVersion";
afterEach(()=>vi.unstubAllGlobals());
test("new local worlds default to V3, explicit V1/V2 flags remain rollback options",()=>{
 for(const [search,version] of [["","metro-v3"],["?worldgen=v3","metro-v3"],["?worldgen=v2","metro-v2"],["?worldgen=v1","metro-v1"]]){
  vi.stubGlobal("window",{location:{search}});expect(previewWorldVersion()).toBe(version);
 }
});
