"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type Stats = { triangles: number; meshes: number; materials: number; sizeM: THREE.Vector3 };

/**
 * GLB-only viewer. The downloaded .gltf files reference external .bin/.png
 * sidecars that were never fetched, so they are unusable - never load one here.
 * DRACOLoader is attached defensively (the decoder is only fetched if a file
 * actually uses KHR_draco_mesh_compression; measured GLBs do not).
 */
export default function ModelViewer({
  url,
  dimensionMm,
}: {
  url: string | null;
  dimensionMm?: { w: number; d: number; h: number } | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!url) {
      setStatus("idle");
      setStats(null);
      return;
    }

    let disposed = false;
    setStatus("loading");
    setProgress(0);
    setMessage(null);
    setStats(null);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth || 640, host.clientHeight || 480, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121417);

    // studio-ish: soft IBL + a key/fill/rim trio
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(-4, 2, 3);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1);
    rim.position.set(0, 3, -5);
    scene.add(key, fill, rim, new THREE.HemisphereLight(0xdfe6f0, 0x2a2d33, 0.6));

    const camera = new THREE.PerspectiveCamera(
      45,
      (host.clientWidth || 640) / (host.clientHeight || 480),
      0.01,
      2000,
    );
    camera.position.set(2, 1.6, 2.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/gltf/");
    loader.setDRACOLoader(draco);

    let root: THREE.Object3D | null = null;

    loader.load(
      url,
      (gltf) => {
        if (disposed) return;
        root = gltf.scene;
        scene.add(root);

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // auto-frame from the bounding box
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const distance = (maxDimension / 2) / Math.tan((camera.fov * Math.PI) / 360);
        camera.near = Math.max(maxDimension / 1000, 0.001);
        camera.far = maxDimension * 100;
        camera.position.copy(center).add(new THREE.Vector3(1, 0.7, 1.25).normalize().multiplyScalar(distance * 1.9));
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.minDistance = maxDimension * 0.05;
        controls.maxDistance = maxDimension * 20;
        controls.update();

        let triangles = 0;
        let meshes = 0;
        const materials = new Set<string>();
        root.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          meshes += 1;
          const geometry = mesh.geometry as THREE.BufferGeometry;
          if (geometry?.index) triangles += geometry.index.count / 3;
          else if (geometry?.attributes?.position) triangles += geometry.attributes.position.count / 3;
          const material = mesh.material;
          for (const entry of Array.isArray(material) ? material : [material]) {
            if (entry) materials.add(entry.name || entry.uuid);
          }
        });

        setStats({ triangles: Math.round(triangles), meshes, materials: materials.size, sizeM: size });
        setStatus("ready");
      },
      (event) => {
        if (disposed) return;
        if (event.total) setProgress(Math.round((event.loaded / event.total) * 100));
      },
      (error) => {
        if (disposed) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : String(error));
      },
    );

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const resize = () => {
      const width = host.clientWidth || 640;
      const height = host.clientHeight || 480;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      draco.dispose();
      envTexture.dispose();
      pmrem.dispose();
      if (root) {
        root.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose();
          const material = mesh.material;
          for (const entry of Array.isArray(material) ? material : [material]) entry?.dispose();
        });
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);

  const nf = new Intl.NumberFormat("ko-KR");

  return (
    <div className="viewer" ref={hostRef}>
      {status !== "ready" && (
        <div className="viewer__overlay">
          {!url && (
            <span>
              로컬 .glb 파일이 아직 없습니다.
              <br />
              <span className="faint">에셋 다운로드가 끝나면 여기에 모델이 뜹니다.</span>
            </span>
          )}
          {url && status === "loading" && <span>불러오는 중… {progress ? `${progress}%` : ""}</span>}
          {url && status === "error" && (
            <span>
              모델을 불러오지 못했습니다.
              <br />
              <span className="faint mono">{message}</span>
            </span>
          )}
        </div>
      )}
      {status === "ready" && stats && (
        <div className="viewer__hud">
          <span>삼각형 {nf.format(stats.triangles)}</span>
          <span>메시 {stats.meshes}</span>
          <span>머티리얼 {stats.materials}</span>
          <span>
            모델 바운딩 {stats.sizeM.x.toFixed(2)} × {stats.sizeM.z.toFixed(2)} ×{" "}
            {stats.sizeM.y.toFixed(2)} m
          </span>
          {dimensionMm && (
            <span>
              등록 치수 {nf.format(Math.round(dimensionMm.w))} × {nf.format(Math.round(dimensionMm.d))} ×{" "}
              {nf.format(Math.round(dimensionMm.h))} mm
            </span>
          )}
        </div>
      )}
    </div>
  );
}
