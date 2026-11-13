import * as THREE from "three";
const ORANGE = 0xff702d;
const CYAN = 0x67dce8;
const owned = [];
function own(resource) {
    owned.push(resource);
    return resource;
}
function material(color, roughness = 0.78, metalness = 0.14, emissive = 0, intensity = 0) {
    return own(new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: intensity }));
}
function boxGeometry(x, y, z) {
    return own(new THREE.BoxGeometry(x, y, z));
}
function makeArch(width, height, spring = 0.68) {
    const half = width / 2;
    const arch = new THREE.Shape();
    arch.moveTo(-half, 0);
    arch.lineTo(-half, height * spring);
    arch.quadraticCurveTo(-half, height, 0, height);
    arch.quadraticCurveTo(half, height, half, height * spring);
    arch.lineTo(half, 0);
    arch.closePath();
    return own(new THREE.ShapeGeometry(arch, 12));
}
function lathe(profile, segments = 20) {
    return own(new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments));
}
function addMesh(parent, geometry, mat, x, y, z) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
}
function addTajMahal(scene, stone, accent, shadow) {
    const taj = new THREE.Group();
    taj.position.set(0, 0, -60);
    taj.scale.setScalar(1.24);
    scene.add(taj);
    const plinth = material(0x898b91, 0.78, 0.08);
    const baseGeo = boxGeometry(23, 1.05, 18);
    addMesh(taj, baseGeo, plinth, 0, 0.55, 0);
    addMesh(taj, boxGeometry(20.7, 1.15, 15.8), stone, 0, 1.62, 0);
    addMesh(taj, boxGeometry(18, 8.3, 13.4), stone, 0, 6.25, 0);
    addMesh(taj, boxGeometry(19.2, 0.55, 14.6), accent, 0, 10.67, 0);
    // The high central iwan, flanked by two smaller recessed arched bays.
    const archGeometry = makeArch(4.45, 6.35, 0.7);
    const sideArchGeometry = makeArch(2.35, 4.85, 0.69);
    addMesh(taj, archGeometry, shadow, 0, 2.05, 6.73);
    addMesh(taj, sideArchGeometry, shadow, -5.72, 2.05, 6.73);
    addMesh(taj, sideArchGeometry, shadow, 5.72, 2.05, 6.73);
    const inset = material(0x42505d, 0.42, 0.18, 0x132233, 0.25);
    addMesh(taj, makeArch(2.4, 4.45, 0.68), inset, 0, 2.05, 6.78);
    addMesh(taj, makeArch(1.18, 3.25, 0.68), inset, -5.72, 2.05, 6.78);
    addMesh(taj, makeArch(1.18, 3.25, 0.68), inset, 5.72, 2.05, 6.78);
    // Onion dome profiles and finials retain the stepped, bulbous Taj silhouette.
    const centralDome = lathe([[0, 0], [0.3, 0.22], [0.54, 0.55], [0.84, 1.05], [1.45, 1.9], [2.15, 3.05], [2.55, 4.05], [2.5, 4.65], [2.15, 5.05], [1.58, 5.27], [0.85, 5.34], [0.25, 5.38], [0, 5.42]], 32);
    addMesh(taj, centralDome, stone, 0, 10.94, 0);
    addMesh(taj, lathe([[0, 0], [0.38, 0.13], [0.31, 0.29], [0.2, 0.4], [0.11, 0.64], [0.045, 1.12], [0, 1.35]], 12), accent, 0, 16.36, 0);
    const roofPositions = [[-6.2, -4.5], [6.2, -4.5], [-6.2, 4.5], [6.2, 4.5]];
    for (const [x, z] of roofPositions) {
        addMesh(taj, boxGeometry(2.1, 0.55, 2.1), accent, x, 11.05, z);
        addMesh(taj, lathe([[0, 0], [0.63, 0.1], [0.57, 0.24], [0.15, 0.24], [0.17, 0.48], [0.31, 0.78], [0.39, 1.06], [0.3, 1.28], [0.15, 1.39], [0, 1.42]], 18), stone, x, 11.3, z);
        addMesh(taj, lathe([[0, 0], [0.08, 0.08], [0.035, 0.28], [0, 0.37]], 8), accent, x, 12.68, z);
    }
    // Four distinct minarets sit at the plinth corners, each with balconies and a cupola.
    const minaret = lathe([[0, 0], [0.84, 0.12], [0.65, 0.35], [0.57, 1.0], [0.45, 2.3], [0.37, 4.2], [0.32, 6.7], [0.38, 7.9], [0.56, 8.08], [0.57, 8.3], [0.35, 8.46], [0.32, 10.2], [0.38, 10.38], [0.55, 10.55], [0.55, 10.76], [0.32, 10.9], [0.3, 11.45], [0, 12.35]], 18);
    const balconyA = own(new THREE.TorusGeometry(0.57, 0.075, 5, 18));
    const balconyB = own(new THREE.TorusGeometry(0.55, 0.07, 5, 18));
    const minaretPositions = [[-13.1, -10.2], [13.1, -10.2], [-13.1, 10.2], [13.1, 10.2]];
    for (const [x, z] of minaretPositions) {
        addMesh(taj, minaret, stone, x, 0.9, z);
        const ring1 = addMesh(taj, balconyA, accent, x, 8.85, z);
        ring1.rotation.x = Math.PI / 2;
        const ring2 = addMesh(taj, balconyB, accent, x, 11.65, z);
        ring2.rotation.x = Math.PI / 2;
    }
    return taj;
}
function makeBuildings(scene) {
    const coreMaterials = [
        material(0x172336, 0.66, 0.34), material(0x202b3a, 0.62, 0.27),
        material(0x121e30, 0.55, 0.4), material(0x273344, 0.7, 0.2),
    ];
    const roofMaterials = [material(0x334354, 0.62, 0.36), material(0x263748, 0.6, 0.3)];
    const windowMat = material(0x86cad5, 0.36, 0.42, 0x234b5a, 0.75);
    const warmWindow = material(0xf1a56a, 0.43, 0.28, 0x8b3b15, 0.45);
    const finMat = material(0x30485a, 0.48, 0.52, 0x14313b, 0.24);
    const buildings = [];
    const windows = [];
    const fins = [];
    const dummy = new THREE.Object3D();
    const windowGeo = boxGeometry(0.24, 0.3, 0.09);
    const finGeo = boxGeometry(0.12, 1, 0.22);
    const roofGeo = boxGeometry(1, 0.8, 1);
    // Ordered urban corridors: varied heights frame the central avenue instead of obscuring the landmark.
    const positions = [];
    const levels = [0, 1, -1, 2, 0, -2, 1, -1];
    for (const side of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
            const z = 28 - i * 10.2;
            const x = side * (18 + (i % 3) * 5.3);
            const h = 9 + ((i * 7 + (side === 1 ? 3 : 0)) % 5) * 3.3 + levels[i % levels.length] * 0.7;
            const w = 5.6 + (i % 3) * 1.45;
            const d = 5 + (i % 2) * 2;
            positions.push([x, z, w, h, d, (i + (side > 0 ? 1 : 0)) % coreMaterials.length]);
        }
    }
    for (let materialIndex = 0; materialIndex < coreMaterials.length; materialIndex++) {
        const selected = positions.filter((item) => item[5] === materialIndex);
        const mesh = new THREE.InstancedMesh(boxGeometry(1, 1, 1), coreMaterials[materialIndex], selected.length);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        selected.forEach(([x, z, w, h, d], i) => {
            dummy.position.set(x, h / 2, z);
            dummy.scale.set(w, h, d);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            buildings.push(mesh);
        });
        mesh.count = selected.length;
        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
        own({ dispose: () => mesh.dispose() });
        const roof = new THREE.InstancedMesh(roofGeo, roofMaterials[materialIndex % roofMaterials.length], selected.length);
        selected.forEach(([x, z, w, h, d], i) => {
            dummy.position.set(x, h + 0.36, z);
            dummy.scale.set(w * 1.08, 0.72, d * 1.08);
            dummy.updateMatrix();
            roof.setMatrixAt(i, dummy.matrix);
        });
        roof.instanceMatrix.needsUpdate = true;
        scene.add(roof);
        own({ dispose: () => roof.dispose() });
        const windowRecords = [];
        const finRecords = [];
        for (const [x, z, w, h, d] of selected) {
            const floors = Math.floor(h / 2.5);
            for (let floor = 1; floor < floors; floor++) {
                for (let col = 0; col < Math.max(2, Math.floor(w / 1.45)); col++) {
                    const wx = x - w / 2 + 0.75 + col * ((w - 1.1) / Math.max(1, Math.floor(w / 1.45) - 1));
                    if ((floor * 3 + col * 5 + Math.round(x)) % 4 !== 0)
                        windowRecords.push({ x: wx, y: floor * 2.35, z: z + d / 2 + 0.06, rot: 0 });
                }
            }
            for (let fin = 0; fin < Math.floor(w / 1.7); fin++)
                finRecords.push({ x: x - w / 2 + .65 + fin * 1.6, y: h / 2, z: z + d / 2 + 0.12 });
        }
        const wm = new THREE.InstancedMesh(windowGeo, materialIndex % 2 ? warmWindow : windowMat, windowRecords.length);
        windowRecords.forEach((item, i) => {
            dummy.position.set(item.x, item.y, item.z);
            dummy.rotation.y = item.rot;
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            wm.setMatrixAt(i, dummy.matrix);
        });
        wm.instanceMatrix.needsUpdate = true;
        scene.add(wm);
        windows.push({ mesh: wm, count: windowRecords.length });
        own({ dispose: () => wm.dispose() });
        const fm = new THREE.InstancedMesh(finGeo, finMat, finRecords.length);
        finRecords.forEach((item, i) => { dummy.position.set(item.x, item.y, item.z); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); fm.setMatrixAt(i, dummy.matrix); });
        fm.instanceMatrix.needsUpdate = true;
        scene.add(fm);
        fins.push({ mesh: fm, count: finRecords.length });
        own({ dispose: () => fm.dispose() });
    }
    return { buildings, windows, fins };
}
export function createAgraScene(aspect) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080f1b);
    scene.fog = new THREE.FogExp2(0x09111f, 0.0055);
    const camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 400);
    const hemisphere = new THREE.HemisphereLight(0x7892b4, 0x111521, 1.55);
    scene.add(hemisphere);
    const moon = new THREE.DirectionalLight(0xa9c9ef, 2.0);
    moon.position.set(-38, 56, -46);
    scene.add(moon);
    const warmHaze = new THREE.PointLight(0xff6f32, 42, 120, 1.6);
    warmHaze.position.set(3, 12, 4);
    scene.add(warmHaze);
    const tajRim = new THREE.PointLight(0x78dbe9, 22, 90, 1.8);
    tajRim.position.set(0, 20, -73);
    scene.add(tajRim);
    const tajKey = new THREE.DirectionalLight(0xe6e7e2, 3.1);
    tajKey.position.set(16, 34, -18);
    tajKey.target.position.set(0, 6, -60);
    scene.add(tajKey, tajKey.target);
    const skylineFill = new THREE.DirectionalLight(0x6c88ad, 0.9);
    skylineFill.position.set(-22, 28, 34);
    skylineFill.target.position.set(0, 0, -34);
    scene.add(skylineFill, skylineFill.target);
    const ground = material(0x0c1420, 0.98, 0.04);
    addMesh(scene, own(new THREE.PlaneGeometry(240, 250)), ground, 0, -0.12, -48).rotation.x = -Math.PI / 2;
    const asphalt = material(0x111b29, 0.86, 0.22);
    const roadGeo = boxGeometry(8, 0.055, 155);
    addMesh(scene, roadGeo, asphalt, 0, -0.015, -31);
    const crossGeo = boxGeometry(142, 0.05, 5.2);
    for (const z of [25, 2, -23, -49, -75])
        addMesh(scene, crossGeo, asphalt, 0, -0.02, z);
    const roadShoulder = material(0x3a2b2a, 0.56, 0.29, 0x381408, 0.22);
    const shoulderGeo = boxGeometry(0.22, 0.08, 155);
    addMesh(scene, shoulderGeo, roadShoulder, -4.16, 0.03, -31);
    addMesh(scene, shoulderGeo, roadShoulder, 4.16, 0.03, -31);
    const roadGlow = material(ORANGE, 0.24, 0.22, ORANGE, 2.5);
    const roadSecondary = material(0xa74720, 0.32, 0.18, 0xff4b17, 0.85);
    const pathSpecs = [];
    pathSpecs.push({ points: [new THREE.Vector3(0, 0.13, 43), new THREE.Vector3(0, 0.13, 24), new THREE.Vector3(0, 0.13, 6), new THREE.Vector3(0, 0.13, -14), new THREE.Vector3(0, 0.13, -38), new THREE.Vector3(0, 0.13, -53)], radius: 0.105, mat: roadGlow });
    for (const z of [25, 2, -23, -49]) {
        pathSpecs.push({ points: [new THREE.Vector3(-58, .11, z + 2.6), new THREE.Vector3(-26, .11, z + 2.6), new THREE.Vector3(-9, .11, z), new THREE.Vector3(0, .11, z), new THREE.Vector3(9, .11, z), new THREE.Vector3(26, .11, z - 2.6), new THREE.Vector3(58, .11, z - 2.6)], radius: .055, mat: roadSecondary });
    }
    const runners = [];
    const runnerGeo = own(new THREE.SphereGeometry(0.18, 8, 6));
    const runnerMat = material(0xffbd75, 0.22, 0.1, 0xff6b27, 3.2);
    for (const spec of pathSpecs) {
        const curve = new THREE.CatmullRomCurve3(spec.points);
        addMesh(scene, own(new THREE.TubeGeometry(curve, 96, spec.radius, 5, false)), spec.mat, 0, 0, 0);
        for (let i = 0; i < (spec.radius > .08 ? 3 : 1); i++) {
            const runner = addMesh(scene, runnerGeo, runnerMat, 0, 0, 0);
            runners.push({ mesh: runner, curve, offset: i / 3, speed: spec.radius > .08 ? .032 : .02 });
        }
    }
    const stone = material(0xe5e1d6, 0.53, 0.22);
    const marbleAccent = material(0xc1c0b8, 0.42, 0.29);
    const tajShadow = material(0x2a3441, 0.66, 0.14);
    addTajMahal(scene, stone, marbleAccent, tajShadow);
    makeBuildings(scene);
    // Restrained illuminated infrastructure beacons along the avenue.
    const beaconMaterial = material(CYAN, 0.26, 0.35, CYAN, 2.2);
    const beaconBase = material(0x2e6070, 0.45, 0.56, 0x1a6777, 0.6);
    const beaconGeometry = own(new THREE.CylinderGeometry(0.045, 0.08, 1.55, 7));
    const beaconPoints = [[-8, 15], [8, 15], [-8, -3], [8, -3], [-8, -21], [8, -21], [-8, -39], [8, -39]];
    for (const [x, z] of beaconPoints) {
        addMesh(scene, beaconGeometry, beaconBase, x, .78, z);
        const ringGeo = own(new THREE.TorusGeometry(.34, .025, 4, 18));
        const ring = addMesh(scene, ringGeo, beaconMaterial, x, 1.58, z);
        ring.rotation.x = Math.PI / 2;
        const beacon = addMesh(scene, own(new THREE.SphereGeometry(.12, 8, 6)), beaconMaterial, x, 1.72, z);
        beacon.userData.beaconPhase = (x + z) * .15;
    }
    // Sparse atmospheric motes; no post-processing or large particle systems.
    const dustGeometry = own(new THREE.BufferGeometry());
    const dustPositions = new Float32Array(72 * 3);
    for (let i = 0; i < 72; i++) {
        dustPositions[i * 3] = ((i * 37) % 111 - 55) + Math.sin(i * 13) * 1.5;
        dustPositions[i * 3 + 1] = 2 + ((i * 17) % 28);
        dustPositions[i * 3 + 2] = 22 - ((i * 23) % 110);
    }
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = own(new THREE.PointsMaterial({ color: 0x80bbcb, size: .11, transparent: true, opacity: .38, depthWrite: false, sizeAttenuation: true }));
    const dust = new THREE.Points(dustGeometry, dustMat);
    scene.add(dust);
    const startPosition = new THREE.Vector3(-20, 49, 76);
    const endPosition = new THREE.Vector3(-20, 23, 27);
    const startTarget = new THREE.Vector3(-20, 7, -38);
    const endTarget = new THREE.Vector3(-20, 9, -49);
    camera.position.copy(startPosition);
    camera.lookAt(startTarget);
    const update = (seconds, cameraProgress) => {
        const progress = THREE.MathUtils.smoothstep(cameraProgress, 0, 1);
        camera.position.lerpVectors(startPosition, endPosition, progress);
        const target = new THREE.Vector3().lerpVectors(startTarget, endTarget, progress);
        camera.position.x += Math.sin(seconds * .11) * .5 * Math.sin(progress * Math.PI);
        camera.position.y += Math.sin(seconds * .19) * .12;
        camera.lookAt(target);
        for (const runner of runners) {
            const t = (seconds * runner.speed + runner.offset) % 1;
            runner.mesh.position.copy(runner.curve.getPointAt(t));
        }
        dust.rotation.y = Math.sin(seconds * .012) * .025;
    };
    const dispose = () => {
        for (const resource of owned)
            resource.dispose();
        owned.length = 0;
        scene.clear();
    };
    return { scene, camera, update, dispose };
}
