import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei/core/Gltf";
import { Box3, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

function Preview({ url }: { url: string }) {
  const { scene } = useGLTF(url, false, false);
  const fitted = useMemo(() => {
    const object = clone(scene);
    object.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(object),
      size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3());
    const scale = 1.5 / Math.max(size.y, size.x, size.z, 0.01);
    return {
      object,
      scale,
      position: [-center.x * scale, -center.y * scale, -center.z * scale] as [
        number,
        number,
        number,
      ],
    };
  }, [scene]);
  useEffect(() => () => fitted.object.traverse(object => {
    if ("isSkinnedMesh" in object) (object as import("three").SkinnedMesh).skeleton.dispose();
  }), [fitted]);
  return (
    <group rotation={[0, 0.3, 0]}>
      <group position={fitted.position} scale={fitted.scale}>
        <primitive object={fitted.object} dispose={null} />
      </group>
    </group>
  );
}
/** 缩略画布只在加载和尺寸变化时绘制，不启动独立动画循环。 */
export default function AvatarThumbnail({ url }: { url: string }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={1}
      camera={{ position: [0, 0.2, 2.5], fov: 42 }}
      gl={{ alpha: true, antialias: false }}
      aria-hidden="true"
    >
      <ambientLight intensity={1.8} />
      <directionalLight position={[2, 3, 4]} intensity={2} />
      <Suspense fallback={null}>
        <Preview url={url} />
      </Suspense>
    </Canvas>
  );
}
