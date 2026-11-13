import * as THREE from "three";
import { createAgraScene } from "./scene.js";
const host = document.querySelector("#scene");
const errorPanel = document.querySelector("#load-error");
const motionButton = document.querySelector("#motion-toggle");
const motionLabel = document.querySelector("#motion-label");
const status = document.querySelector("#scene-status");
if (host) {
    let renderer;
    let world;
    let resizeObserver;
    let intersectionObserver;
    let active = false;
    let disposed = false;
    let paused = false;
    let elapsed = 0;
    let previousFrame = 0;
    let lastRender = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const showFallback = () => {
        if (errorPanel)
            errorPanel.hidden = false;
        if (status)
            status.textContent = "STATIC PREVIEW / 3D UNAVAILABLE";
        if (motionButton)
            motionButton.hidden = true;
    };
    const resize = () => {
        if (!renderer || !world || !host)
            return;
        const { width, height } = host.getBoundingClientRect();
        if (width < 1 || height < 1)
            return;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 600 ? 1.25 : 1.6);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
        world.camera.aspect = width / height;
        world.camera.updateProjectionMatrix();
        if (reducedMotion.matches)
            renderer.render(world.scene, world.camera);
    };
    const renderFrame = (now) => {
        if (!renderer || !world || disposed)
            return;
        if (now - lastRender < 15)
            return;
        lastRender = now;
        if (!paused && !reducedMotion.matches) {
            const delta = previousFrame ? Math.min((now - previousFrame) / 1000, 0.05) : 0;
            elapsed += delta;
        }
        previousFrame = now;
        const cameraProgress = reducedMotion.matches ? 0 : Math.min(elapsed / 34, 1);
        world.update(reducedMotion.matches ? 0 : elapsed, cameraProgress);
        renderer.render(world.scene, world.camera);
    };
    const syncLoop = () => {
        if (!renderer)
            return;
        const shouldRun = active && !document.hidden && !reducedMotion.matches;
        renderer.setAnimationLoop(shouldRun ? renderFrame : null);
        if (!shouldRun && renderer && world) {
            world.update(0, 0);
            renderer.render(world.scene, world.camera);
        }
        previousFrame = 0;
    };
    const onVisibilityChange = () => syncLoop();
    const onMotionPreferenceChange = () => {
        if (motionButton)
            motionButton.hidden = reducedMotion.matches;
        syncLoop();
    };
    const onPageHide = () => {
        if (disposed)
            return;
        disposed = true;
        active = false;
        renderer?.setAnimationLoop(null);
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        reducedMotion.removeEventListener("change", onMotionPreferenceChange);
        world?.dispose();
        renderer?.dispose();
        renderer?.domElement.remove();
        renderer = undefined;
    };
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power", stencil: false, depth: true });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.16;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 600 ? 1.25 : 1.6));
        renderer.domElement.setAttribute("aria-hidden", "true");
        host.appendChild(renderer.domElement);
        const bounds = host.getBoundingClientRect();
        world = createAgraScene(bounds.width / Math.max(bounds.height, 1));
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        intersectionObserver = new IntersectionObserver(([entry]) => {
            active = entry?.isIntersecting ?? false;
            syncLoop();
        });
        intersectionObserver.observe(host);
        document.addEventListener("visibilitychange", onVisibilityChange);
        reducedMotion.addEventListener("change", onMotionPreferenceChange);
        if (motionButton && motionLabel) {
            motionButton.hidden = reducedMotion.matches;
            motionButton.addEventListener("click", () => {
                paused = !paused;
                motionButton.dataset.paused = String(paused);
                motionButton.setAttribute("aria-pressed", String(paused));
                motionButton.setAttribute("aria-label", paused ? "Resume camera movement" : "Pause camera movement");
                motionLabel.textContent = paused ? "Resume camera" : "Pause camera";
            });
        }
        resize();
        active = true;
        syncLoop();
        window.addEventListener("pagehide", onPageHide, { once: true });
    }
    catch (error) {
        console.error("RoadFix scene preview could not initialize:", error);
        onPageHide();
        showFallback();
    }
}
