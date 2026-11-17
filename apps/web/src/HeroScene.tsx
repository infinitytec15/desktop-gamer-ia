import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
export default function HeroScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }
    root.appendChild(renderer.domElement);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.5, 9);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xa8a5df, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 5);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const purple = new THREE.PointLight(0x815aff, 65, 10);
    purple.position.set(2, 1, 2);
    scene.add(purple);
    const rim = new THREE.PointLight(0xc4c9ff, 40, 12);
    rim.position.set(-3, -2, 0);
    scene.add(rim);
    const assembly = new THREE.Group();
    assembly.rotation.set(0.35, -0.6, -0.24);
    scene.add(assembly);
    const metal = new THREE.MeshStandardMaterial({
      color: 0x333541,
      metalness: 0.85,
      roughness: 0.24,
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x12131b,
      metalness: 0.7,
      roughness: 0.3,
    });
    const luminous = new THREE.MeshStandardMaterial({
      color: 0x9772ff,
      emissive: 0x7141ed,
      emissiveIntensity: 2.5,
      metalness: 0.5,
      roughness: 0.25,
    });
    const geometries: THREE.BufferGeometry[] = [];
    function box(
      w: number,
      h: number,
      d: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      r = 0.08,
    ) {
      const geometry = new RoundedBoxGeometry(w, h, d, 3, r);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      assembly.add(mesh);
      return mesh;
    }
    box(3.1, 0.27, 3.1, metal, 0, -0.9, 0, 0.12);
    box(2.95, 0.07, 2.95, luminous, 0, -0.71, 0);
    box(2.8, 0.25, 2.8, black, 0, -0.5, 0);
    const top = box(2.45, 0.32, 2.45, metal, 0, 0.4, 0, 0.12);
    box(1.92, 0.035, 1.92, luminous, 0, 0.58, 0, 0.05);
    box(1.85, 0.09, 1.85, black, 0, 0.64, 0, 0.04);
    // Usinagem do dissipador e conexões: geometria real, sem métricas fictícias.
    for (let i = 0; i < 14; i++)
      box(0.07, 0.5, 2.6, metal, -1.23 + i * 0.19, -0.05, 0, 0.015);
    for (let i = 0; i < 9; i++) {
      for (const side of [-1, 1]) {
        box(0.16, 0.06, 0.35, metal, side * 1.6, -0.9, -1.1 + i * 0.275, 0.01);
        box(0.35, 0.06, 0.16, metal, -1.1 + i * 0.275, -0.9, side * 1.6, 0.01);
      }
    }
    const glyph = new THREE.Shape();
    glyph.moveTo(0.1, 0.55);
    glyph.lineTo(-0.43, -0.08);
    glyph.lineTo(-0.05, -0.08);
    glyph.lineTo(-0.12, -0.55);
    glyph.lineTo(0.43, 0.14);
    glyph.lineTo(0.04, 0.14);
    glyph.closePath();
    const boltGeo = new THREE.ExtrudeGeometry(glyph, {
      depth: 0.025,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 2,
      steps: 1,
    });
    geometries.push(boltGeo);
    const bolt = new THREE.Mesh(boltGeo, luminous);
    bolt.rotation.x = -Math.PI / 2;
    bolt.position.y = 0.71;
    assembly.add(bolt);
    let targetX = 0,
      targetY = 0,
      frame = 0,
      visible = true;
    const pointer = (e: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      targetX = (e.clientX - rect.left) / rect.width - 0.5;
      targetY = (e.clientY - rect.top) / rect.height - 0.5;
    };
    root.addEventListener("pointermove", pointer);
    const exit = () => {
      targetX = 0;
      targetY = 0;
    };
    root.addEventListener("pointerleave", exit);
    const clock = new THREE.Clock();
    const render = () => {
      if (!visible || document.hidden) return;
      const t = clock.getElapsedTime();
      if (!reduced.matches) {
        assembly.rotation.y +=
          (-0.6 + targetX * 0.35 - assembly.rotation.y) * 0.035;
        assembly.rotation.x +=
          (0.35 + targetY * 0.2 - assembly.rotation.x) * 0.035;
        assembly.position.y = Math.sin(t * 0.65) * 0.055;
      }
      renderer.render(scene, camera);
      if (!reduced.matches) frame = requestAnimationFrame(render);
    };
    function start() {
      cancelAnimationFrame(frame);
      render();
    }
    const resize = new ResizeObserver(() => {
      const { width, height } = root.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      start();
    });
    resize.observe(root);
    const observer = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else cancelAnimationFrame(frame);
    });
    observer.observe(root);
    const visibility = () => {
      if (!document.hidden) start();
      else cancelAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", start);
    const context = gsap.context(() => {
      if (!reduced.matches)
        gsap.from(assembly.rotation, {
          y: 0.5,
          z: 0.2,
          duration: 1.4,
          ease: "power3.out",
        });
      if (!reduced.matches)
        gsap.from(top.position, { y: 1.25, duration: 1.4, ease: "power3.out" });
    }, root);
    start();
    return () => {
      context.revert();
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      root.removeEventListener("pointermove", pointer);
      root.removeEventListener("pointerleave", exit);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", start);
      for (const g of geometries) g.dispose();
      metal.dispose();
      black.dispose();
      luminous.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div ref={host} className="hero-canvas" aria-hidden="true" />;
}
