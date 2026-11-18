import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export default function MeshPreview({
  positions,
  rotation,
}: {
  positions: Float32Array;
  rotation: [number, number, number];
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10000);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x443366, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, -2, 5);
    scene.add(light);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions.slice(), 3),
    );
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
        color: 0xad91ef,
        metalness: 0.12,
        roughness: 0.5,
        side: THREE.DoubleSide,
      }),
      mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(
      ...(rotation.map((v) => (v * Math.PI) / 180) as [number, number, number]),
    );
    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh),
      size = box.getSize(new THREE.Vector3()),
      center = box.getCenter(new THREE.Vector3()),
      span = Math.max(...size.toArray());
    mesh.position.sub(center);
    camera.position.set(span * 1.7, -span * 1.7, span * 1.3);
    camera.near = Math.max(0.001, span / 1000);
    camera.far = Math.max(100, span * 20);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const grid = new THREE.GridHelper(span * 1.6, 12, 0x665577, 0x292735);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -size.z / 2;
    scene.add(grid);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = span * 0.3;
    controls.maxDistance = span * 8;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const observer = new ResizeObserver(() => {
      const width = host.clientWidth,
        height = host.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      render();
    });
    observer.observe(host);
    render();
    return () => {
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      grid.geometry.dispose();
      if (Array.isArray(grid.material))
        grid.material.forEach((m) => m.dispose());
      else grid.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [positions, rotation]);
  return (
    <div
      className="print-model-canvas"
      ref={root}
      role="img"
      aria-label="Prévia geométrica do STL; arraste para orbitar, sem alterar a orientação de exportação"
    />
  );
}
