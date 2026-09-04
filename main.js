// main.js – with camera preview window
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---- DOM refs ----
const loadingEl = document.getElementById('loading');
const statusEl = document.getElementById('status-msg');
const searchBox = document.getElementById('searchBox');
const autoRotateBtn = document.getElementById('autoRotateBtn');
const cameraPreview = document.getElementById('camera-preview');
const cameraStatus = document.getElementById('camera-status');
const cameraToggle = document.getElementById('camera-toggle');
const videoWrapper = document.getElementById('camera-video-wrapper');

// ---- Toggle camera preview ----
let cameraVisible = true;
cameraToggle.addEventListener('click', () => {
    cameraVisible = !cameraVisible;
    cameraPreview.classList.toggle('hidden', !cameraVisible);
    cameraToggle.textContent = cameraVisible ? '−' : '+';
});

// ---- Constants ----
const COLORS = { C: 0x404040, H: 0xffffff, O: 0xff0d0d, N: 0x3050f8, S: 0xffd700, Cl: 0x1eff00 };
const RADII = { C: 0.5, H: 0.3, O: 0.45, N: 0.5, S: 0.55, Cl: 0.55 };
const BOND_COLOR = 0x888888;

// ---- THREE.JS ----
const container = document.createElement('div');
document.body.appendChild(container);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f1a);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3, 1.5, 4);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.left = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild(labelRenderer.domElement);

scene.add(new THREE.AmbientLight(0x404060, 0.6));
const mainLight = new THREE.DirectionalLight(0xffeedd, 1.8);
mainLight.position.set(5, 8, 5);
mainLight.castShadow = true;
scene.add(mainLight);

const light2 = new THREE.DirectionalLight(0x4488ff, 0.6);
light2.position.set(-3, -1, -5);
scene.add(light2);

const light3 = new THREE.DirectionalLight(0x88ddff, 0.5);
light3.position.set(-2, 3, 4);
scene.add(light3);

const gridHelper = new THREE.GridHelper(6, 20, 0x00e676, 0x336699);
gridHelper.position.y = -1.2;
scene.add(gridHelper);

const particleGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(400 * 3);
for (let i = 0; i < 400 * 3; i++) pPos[i] = (Math.random() - 0.5) * 15;
particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({ color: 0x64b5f6, size: 0.02, transparent: true, opacity: 0.4 }));
particles.position.y = 1;
scene.add(particles);

const moleculeGroup = new THREE.Group();
scene.add(moleculeGroup);

// ---- Controls ----
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.2;
controls.minDistance = 1.5;
controls.maxDistance = 10;
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.enabled = true;

// ---- Auto-rotate ----
let autoRotate = false;
autoRotateBtn.addEventListener('click', () => {
    autoRotate = !autoRotate;
    autoRotateBtn.classList.toggle('active');
});

// ---- Hand tracking state ----
let prevHandX = 0, prevHandY = 0, pinchDistance = 0, resetTimer = null;
let handTrackingActive = false;

// ---- MOLECULE GENERATOR (115+ molecules) ----
const MOLECULES = {};

function addMol(key, name, formula, category, atoms, bonds) {
    MOLECULES[key] = { name, formula, category, atoms, bonds };
}

function chainPositions(n) {
    const pos = [];
    for (let i = 0; i < n; i++) {
        const x = i * 1.2;
        const y = (i % 2 === 0) ? 0.3 : -0.3;
        const z = (i % 2 === 0) ? 0.2 : -0.2;
        pos.push(new THREE.Vector3(x, y, z));
    }
    return pos;
}

function getHPositions(center, neighbors, numH) {
    if (numH === 0) return [];
    const tetraVectors = [
        new THREE.Vector3(1, 1, 1).normalize(),
        new THREE.Vector3(1, -1, -1).normalize(),
        new THREE.Vector3(-1, 1, -1).normalize(),
        new THREE.Vector3(-1, -1, 1).normalize()
    ];
    if (neighbors.length === 0) {
        return tetraVectors.slice(0, numH).map(d => center.clone().add(d.clone().multiplyScalar(0.6)));
    }
    const avg = new THREE.Vector3();
    neighbors.forEach(n => {
        if (n) avg.add(n.clone().sub(center).normalize());
    });
    avg.normalize();
    const scored = tetraVectors.map(d => ({ dir: d, score: -d.dot(avg) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, numH).map(s => center.clone().add(s.dir.clone().multiplyScalar(0.6)));
}

// ---- ALKANES (C1-C12) ----
const alkaneNames = ['Meth', 'Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec', 'Undec', 'Dodec'];
for (let n = 1; n <= 12; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    for (let i = 0; i < n - 1; i++) bonds.push([i, i + 1]);
    for (let i = 0; i < n; i++) {
        const neighbors = [];
        if (i > 0) neighbors.push(cPos[i - 1]);
        if (i < n - 1) neighbors.push(cPos[i + 1]);
        const numH = 4 - neighbors.length;
        const hPos = getHPositions(cPos[i], neighbors, numH);
        hPos.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const name = alkaneNames[n - 1] + 'ane';
    const formula = `C${n}H${2*n+2}`;
    addMol(name.toLowerCase(), name, formula, 'alkane', atoms, bonds);
}

// ---- ALKENES (C2-C10) ----
const alkeneNames = ['Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec'];
for (let n = 2; n <= 10; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    bonds.push([0, 1, 2]);
    for (let i = 1; i < n - 1; i++) bonds.push([i, i + 1]);
    for (let i = 0; i < n; i++) {
        const neighbors = [];
        if (i === 0) {
            neighbors.push(cPos[1]);
        } else if (i === 1) {
            neighbors.push(cPos[0]);
            if (n > 2) neighbors.push(cPos[2]);
        } else {
            if (i > 0) neighbors.push(cPos[i - 1]);
            if (i < n - 1) neighbors.push(cPos[i + 1]);
        }
        let val = 4;
        if (i === 0 || i === 1) val = 3;
        const numH = val - neighbors.length;
        const hPos = getHPositions(cPos[i], neighbors, numH);
        hPos.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const name = alkeneNames[n - 2] + 'ene';
    const formula = `C${n}H${2*n}`;
    addMol(name.toLowerCase(), name, formula, 'alkene', atoms, bonds);
}

// ---- ALKYNES (C2-C10) ----
const alkyneNames = ['Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec'];
for (let n = 2; n <= 10; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    bonds.push([0, 1, 3]);
    for (let i = 1; i < n - 1; i++) bonds.push([i, i + 1]);
    for (let i = 0; i < n; i++) {
        const neighbors = [];
        if (i === 0) {
            neighbors.push(cPos[1]);
        } else if (i === 1) {
            neighbors.push(cPos[0]);
            if (n > 2) neighbors.push(cPos[2]);
        } else {
            if (i > 0) neighbors.push(cPos[i - 1]);
            if (i < n - 1) neighbors.push(cPos[i + 1]);
        }
        let numH;
        if (i === 0) numH = 1;
        else if (i === 1) numH = 1;
        else numH = 4 - neighbors.length;
        if (n === 2) numH = 1;
        const hPos = getHPositions(cPos[i], neighbors, numH);
        hPos.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const name = alkyneNames[n - 2] + 'yne';
    const formula = `C${n}H${2*n-2}`;
    addMol(name.toLowerCase(), name, formula, 'alkyne', atoms, bonds);
}

// ---- ALCOHOLS (C1-C10) ----
for (let n = 1; n <= 10; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    for (let i = 0; i < n - 1; i++) bonds.push([i, i + 1]);
    const ohPos = cPos[0].clone().add(new THREE.Vector3(-0.6, 0.6, 0));
    atoms.push({ elem: 'O', pos: [ohPos.x, ohPos.y, ohPos.z] });
    bonds.push([0, atoms.length - 1]);
    const hPosOH = ohPos.clone().add(new THREE.Vector3(-0.4, 0.4, 0));
    atoms.push({ elem: 'H', pos: [hPosOH.x, hPosOH.y, hPosOH.z] });
    bonds.push([atoms.length - 2, atoms.length - 1]);
    for (let i = 0; i < n; i++) {
        const neighbors = [cPos[i - 1], cPos[i + 1]].filter(p => p);
        if (i === 0) neighbors.push(ohPos);
        const numH = 4 - neighbors.length;
        const hPos = getHPositions(cPos[i], neighbors, numH);
        hPos.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const prefix = ['Meth', 'Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec'][n - 1];
    const name = prefix + 'anol';
    const formula = `C${n}H${2*n+2}O`;
    addMol(name.toLowerCase(), name, formula, 'alcohol', atoms, bonds);
}

// ---- ALDEHYDES (C1-C10) ----
for (let n = 1; n <= 10; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    for (let i = 0; i < n - 1; i++) bonds.push([i, i + 1]);
    const oPos = cPos[0].clone().add(new THREE.Vector3(-0.6, 0.6, 0));
    atoms.push({ elem: 'O', pos: [oPos.x, oPos.y, oPos.z] });
    bonds.push([0, atoms.length - 1, 2]);
    const hPos = cPos[0].clone().add(new THREE.Vector3(-0.6, -0.6, 0));
    atoms.push({ elem: 'H', pos: [hPos.x, hPos.y, hPos.z] });
    bonds.push([0, atoms.length - 1]);
    for (let i = 0; i < n; i++) {
        const neighbors = [cPos[i - 1], cPos[i + 1]].filter(p => p);
        if (i === 0) neighbors.push(oPos);
        let val = 4;
        if (i === 0) val = 3;
        const numH = val - neighbors.length;
        const hPositions = getHPositions(cPos[i], neighbors, numH);
        hPositions.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const prefix = ['Meth', 'Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec'][n - 1];
    const name = prefix + 'anal';
    const formula = `C${n}H${2*n}O`;
    addMol(name.toLowerCase(), name, formula, 'aldehyde', atoms, bonds);
}

// ---- KETONES (C3-C10) ----
for (let n = 3; n <= 10; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    for (let i = 0; i < n - 1; i++) bonds.push([i, i + 1]);
    const oPos = cPos[1].clone().add(new THREE.Vector3(0, 0.6, 0.6));
    atoms.push({ elem: 'O', pos: [oPos.x, oPos.y, oPos.z] });
    bonds.push([1, atoms.length - 1, 2]);
    for (let i = 0; i < n; i++) {
        const neighbors = [cPos[i - 1], cPos[i + 1]].filter(p => p);
        if (i === 1) neighbors.push(oPos);
        let val = 4;
        if (i === 1) val = 3;
        const numH = val - neighbors.length;
        const hPositions = getHPositions(cPos[i], neighbors, numH);
        hPositions.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const prefix = ['Propan', 'Butan', 'Pentan', 'Hexan', 'Heptan', 'Octan', 'Nonan', 'Decan'][n - 3];
    const name = prefix + 'one';
    const formula = `C${n}H${2*n}O`;
    addMol(name.toLowerCase(), name, formula, 'ketone', atoms, bonds);
}

// ---- ACIDS (C1-C10) ----
for (let n = 1; n <= 10; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    for (let i = 0; i < n - 1; i++) bonds.push([i, i + 1]);
    const o1Pos = cPos[0].clone().add(new THREE.Vector3(-0.6, 0.6, 0));
    atoms.push({ elem: 'O', pos: [o1Pos.x, o1Pos.y, o1Pos.z] });
    bonds.push([0, atoms.length - 1, 2]);
    const o2Pos = cPos[0].clone().add(new THREE.Vector3(-0.6, -0.4, 0.6));
    atoms.push({ elem: 'O', pos: [o2Pos.x, o2Pos.y, o2Pos.z] });
    bonds.push([0, atoms.length - 1]);
    const hPosOH = o2Pos.clone().add(new THREE.Vector3(-0.4, -0.4, 0.4));
    atoms.push({ elem: 'H', pos: [hPosOH.x, hPosOH.y, hPosOH.z] });
    bonds.push([atoms.length - 2, atoms.length - 1]);
    for (let i = 0; i < n; i++) {
        const neighbors = [cPos[i - 1], cPos[i + 1]].filter(p => p);
        if (i === 0) { neighbors.push(o1Pos); neighbors.push(o2Pos); }
        const numH = 4 - neighbors.length;
        const hPositions = getHPositions(cPos[i], neighbors, numH);
        hPositions.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const prefix = ['Meth', 'Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec'][n - 1];
    const name = prefix + 'anoic acid';
    const formula = `C${n}H${2*n}O₂`;
    addMol(name.toLowerCase().replace(/\s/g, '_'), name, formula, 'acid', atoms, bonds);
}

// ---- ESTERS (C2-C10) ----
for (let n = 2; n <= 10; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    for (let i = 0; i < n - 1; i++) bonds.push([i, i + 1]);
    const o1Pos = cPos[0].clone().add(new THREE.Vector3(-0.6, 0.6, 0));
    atoms.push({ elem: 'O', pos: [o1Pos.x, o1Pos.y, o1Pos.z] });
    bonds.push([0, atoms.length - 1, 2]);
    const o2Pos = cPos[0].clone().add(new THREE.Vector3(-0.6, -0.4, 0.6));
    atoms.push({ elem: 'O', pos: [o2Pos.x, o2Pos.y, o2Pos.z] });
    bonds.push([0, atoms.length - 1]);
    const cMePos = o2Pos.clone().add(new THREE.Vector3(-0.6, 0, 0));
    atoms.push({ elem: 'C', pos: [cMePos.x, cMePos.y, cMePos.z] });
    bonds.push([atoms.length - 2, atoms.length - 1]);
    const hPosMe = getHPositions(cMePos, [o2Pos], 3);
    hPosMe.forEach(p => {
        atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
        bonds.push([atoms.length - 2, atoms.length - 1]);
    });
    for (let i = 0; i < n; i++) {
        const neighbors = [cPos[i - 1], cPos[i + 1]].filter(p => p);
        if (i === 0) { neighbors.push(o1Pos); neighbors.push(o2Pos); }
        const numH = 4 - neighbors.length;
        const hPositions = getHPositions(cPos[i], neighbors, numH);
        hPositions.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const prefix = ['Meth', 'Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec'][n - 1];
    const name = 'Methyl ' + prefix.toLowerCase() + 'anoate';
    const formula = `C${n+1}H${2*n+2}O₂`;
    addMol(name.toLowerCase().replace(/\s/g, '_'), name, formula, 'ester', atoms, bonds);
}

// ---- AMINES (C1-C10) ----
for (let n = 1; n <= 10; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    for (let i = 0; i < n - 1; i++) bonds.push([i, i + 1]);
    const nPos = cPos[0].clone().add(new THREE.Vector3(-0.6, 0.6, 0));
    atoms.push({ elem: 'N', pos: [nPos.x, nPos.y, nPos.z] });
    bonds.push([0, atoms.length - 1]);
    const h1Pos = nPos.clone().add(new THREE.Vector3(-0.4, 0.4, 0));
    atoms.push({ elem: 'H', pos: [h1Pos.x, h1Pos.y, h1Pos.z] });
    bonds.push([atoms.length - 2, atoms.length - 1]);
    const h2Pos = nPos.clone().add(new THREE.Vector3(-0.4, -0.4, 0.4));
    atoms.push({ elem: 'H', pos: [h2Pos.x, h2Pos.y, h2Pos.z] });
    bonds.push([atoms.length - 3, atoms.length - 1]);
    for (let i = 0; i < n; i++) {
        const neighbors = [cPos[i - 1], cPos[i + 1]].filter(p => p);
        if (i === 0) neighbors.push(nPos);
        const numH = 4 - neighbors.length;
        const hPositions = getHPositions(cPos[i], neighbors, numH);
        hPositions.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const prefix = ['Meth', 'Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec'][n - 1];
    const name = prefix + 'ylamine';
    const formula = `C${n}H${2*n+3}N`;
    addMol(name.toLowerCase(), name, formula, 'amine', atoms, bonds);
}

// ---- HALIDES (Chloro, C1-C10) ----
for (let n = 1; n <= 10; n++) {
    const cPos = chainPositions(n);
    const atoms = [];
    const bonds = [];
    cPos.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    for (let i = 0; i < n - 1; i++) bonds.push([i, i + 1]);
    const clPos = cPos[0].clone().add(new THREE.Vector3(-0.6, 0.6, 0));
    atoms.push({ elem: 'Cl', pos: [clPos.x, clPos.y, clPos.z] });
    bonds.push([0, atoms.length - 1]);
    for (let i = 0; i < n; i++) {
        const neighbors = [cPos[i - 1], cPos[i + 1]].filter(p => p);
        if (i === 0) neighbors.push(clPos);
        const numH = 4 - neighbors.length;
        const hPositions = getHPositions(cPos[i], neighbors, numH);
        hPositions.forEach(p => {
            atoms.push({ elem: 'H', pos: [p.x, p.y, p.z] });
            bonds.push([i, atoms.length - 1]);
        });
    }
    const name = 'Chloro' + alkaneNames[n - 1].toLowerCase() + 'ane';
    const formula = `C${n}H${2*n+1}Cl`;
    addMol(name.toLowerCase(), name, formula, 'halide', atoms, bonds);
}

// ---- CYCLOALKANES (C3-C8) ----
const cycloNames = ['Cyclopropane', 'Cyclobutane', 'Cyclopentane', 'Cyclohexane', 'Cycloheptane', 'Cyclooctane'];
for (let n = 3; n <= 8; n++) {
    const atoms = [];
    const bonds = [];
    const radius = 1.0;
    const cPos = [];
    for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        const y = 0;
        const p = new THREE.Vector3(x, y, z);
        cPos.push(p);
        atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] });
    }
    for (let i = 0; i < n; i++) {
        bonds.push([i, (i + 1) % n]);
    }
    for (let i = 0; i < n; i++) {
        const center = cPos[i];
        const normal = new THREE.Vector3(0, 1, 0);
        const hUp = center.clone().add(normal.clone().multiplyScalar(0.6));
        atoms.push({ elem: 'H', pos: [hUp.x, hUp.y, hUp.z] });
        bonds.push([i, atoms.length - 1]);
        const hDown = center.clone().add(normal.clone().multiplyScalar(-0.6));
        atoms.push({ elem: 'H', pos: [hDown.x, hDown.y, hDown.z] });
        bonds.push([i, atoms.length - 1]);
    }
    const name = cycloNames[n - 3];
    const formula = `C${n}H${2*n}`;
    addMol(name.toLowerCase(), name, formula, 'cyclo', atoms, bonds);
}

// ---- AROMATICS ----
const benzenePos = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0.5, 0, 0.866),
    new THREE.Vector3(-0.5, 0, 0.866),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(-0.5, 0, -0.866),
    new THREE.Vector3(0.5, 0, -0.866)
];

function buildAromatic(positions, substituents, name, formula, category) {
    const atoms = [];
    const bonds = [];
    positions.forEach(p => atoms.push({ elem: 'C', pos: [p.x, p.y, p.z] }));
    for (let i = 0; i < 6; i++) {
        const order = (i % 2 === 0) ? 2 : 1;
        bonds.push([i, (i + 1) % 6, order]);
    }
    positions.forEach((p, i) => {
        const sub = substituents[i] || 'H';
        if (sub === 'H') {
            const hPos = getHPositions(p, [positions[(i - 1 + 6) % 6], positions[(i + 1) % 6]], 1);
            hPos.forEach(hp => {
                atoms.push({ elem: 'H', pos: [hp.x, hp.y, hp.z] });
                bonds.push([i, atoms.length - 1]);
            });
        } else if (sub === 'CH3') {
            const cPos = p.clone().add(new THREE.Vector3(0, 0, 1.2));
            atoms.push({ elem: 'C', pos: [cPos.x, cPos.y, cPos.z] });
            bonds.push([i, atoms.length - 1]);
            const hPos = getHPositions(cPos, [p], 3);
            hPos.forEach(hp => {
                atoms.push({ elem: 'H', pos: [hp.x, hp.y, hp.z] });
                bonds.push([atoms.length - 2, atoms.length - 1]);
            });
        } else if (sub === 'OH') {
            const oPos = p.clone().add(new THREE.Vector3(0, 0, 1.0));
            atoms.push({ elem: 'O', pos: [oPos.x, oPos.y, oPos.z] });
            bonds.push([i, atoms.length - 1]);
            const hPos = oPos.clone().add(new THREE.Vector3(0, 0, 0.6));
            atoms.push({ elem: 'H', pos: [hPos.x, hPos.y, hPos.z] });
            bonds.push([atoms.length - 2, atoms.length - 1]);
        } else if (sub === 'NH2') {
            const nPos = p.clone().add(new THREE.Vector3(0, 0, 1.0));
            atoms.push({ elem: 'N', pos: [nPos.x, nPos.y, nPos.z] });
            bonds.push([i, atoms.length - 1]);
            const h1 = nPos.clone().add(new THREE.Vector3(0.4, 0, 0.4));
            atoms.push({ elem: 'H', pos: [h1.x, h1.y, h1.z] });
            bonds.push([atoms.length - 2, atoms.length - 1]);
            const h2 = nPos.clone().add(new THREE.Vector3(-0.4, 0, 0.4));
            atoms.push({ elem: 'H', pos: [h2.x, h2.y, h2.z] });
            bonds.push([atoms.length - 3, atoms.length - 1]);
        } else if (sub === 'COOH') {
            const cPos = p.clone().add(new THREE.Vector3(0, 0, 1.2));
            atoms.push({ elem: 'C', pos: [cPos.x, cPos.y, cPos.z] });
            bonds.push([i, atoms.length - 1]);
            const o1 = cPos.clone().add(new THREE.Vector3(0.4, 0.6, 0.4));
            atoms.push({ elem: 'O', pos: [o1.x, o1.y, o1.z] });
            bonds.push([atoms.length - 2, atoms.length - 1, 2]);
            const o2 = cPos.clone().add(new THREE.Vector3(-0.4, -0.4, 0.4));
            atoms.push({ elem: 'O', pos: [o2.x, o2.y, o2.z] });
            bonds.push([atoms.length - 3, atoms.length - 1]);
            const hOH = o2.clone().add(new THREE.Vector3(-0.4, -0.4, 0.4));
            atoms.push({ elem: 'H', pos: [hOH.x, hOH.y, hOH.z] });
            bonds.push([atoms.length - 2, atoms.length - 1]);
        } else if (sub === 'CHO') {
            const cPos = p.clone().add(new THREE.Vector3(0, 0, 1.2));
            atoms.push({ elem: 'C', pos: [cPos.x, cPos.y, cPos.z] });
            bonds.push([i, atoms.length - 1]);
            const o1 = cPos.clone().add(new THREE.Vector3(0.4, 0.6, 0.4));
            atoms.push({ elem: 'O', pos: [o1.x, o1.y, o1.z] });
            bonds.push([atoms.length - 2, atoms.length - 1, 2]);
            const h = cPos.clone().add(new THREE.Vector3(-0.4, -0.6, 0.4));
            atoms.push({ elem: 'H', pos: [h.x, h.y, h.z] });
            bonds.push([atoms.length - 3, atoms.length - 1]);
        } else if (sub === 'OCH3') {
            const oPos = p.clone().add(new THREE.Vector3(0, 0, 1.0));
            atoms.push({ elem: 'O', pos: [oPos.x, oPos.y, oPos.z] });
            bonds.push([i, atoms.length - 1]);
            const cPos = oPos.clone().add(new THREE.Vector3(0, 0, 0.8));
            atoms.push({ elem: 'C', pos: [cPos.x, cPos.y, cPos.z] });
            bonds.push([atoms.length - 2, atoms.length - 1]);
            const hPos = getHPositions(cPos, [oPos], 3);
            hPos.forEach(hp => {
                atoms.push({ elem: 'H', pos: [hp.x, hp.y, hp.z] });
                bonds.push([atoms.length - 2, atoms.length - 1]);
            });
        } else if (sub === 'C2H5') {
            const c1 = p.clone().add(new THREE.Vector3(0, 0, 1.2));
            atoms.push({ elem: 'C', pos: [c1.x, c1.y, c1.z] });
            bonds.push([i, atoms.length - 1]);
            const c2 = c1.clone().add(new THREE.Vector3(0, 0, 1.0));
            atoms.push({ elem: 'C', pos: [c2.x, c2.y, c2.z] });
            bonds.push([atoms.length - 2, atoms.length - 1]);
            const h1 = getHPositions(c1, [p, c2], 2);
            h1.forEach(hp => {
                atoms.push({ elem: 'H', pos: [hp.x, hp.y, hp.z] });
                bonds.push([atoms.length - 3, atoms.length - 1]);
            });
            const h2 = getHPositions(c2, [c1], 3);
            h2.forEach(hp => {
                atoms.push({ elem: 'H', pos: [hp.x, hp.y, hp.z] });
                bonds.push([atoms.length - 2, atoms.length - 1]);
            });
        } else if (sub === 'Cl') {
            const clPos = p.clone().add(new THREE.Vector3(0, 0, 1.0));
            atoms.push({ elem: 'Cl', pos: [clPos.x, clPos.y, clPos.z] });
            bonds.push([i, atoms.length - 1]);
        }
    });
    addMol(name.toLowerCase().replace(/\s/g, '_'), name, formula, category, atoms, bonds);
}

buildAromatic(benzenePos, ['H', 'H', 'H', 'H', 'H', 'H'], 'Benzene', 'C₆H₆', 'aromatic');
buildAromatic(benzenePos, ['CH3', 'H', 'H', 'H', 'H', 'H'], 'Toluene', 'C₇H₈', 'aromatic');
buildAromatic(benzenePos, ['OH', 'H', 'H', 'H', 'H', 'H'], 'Phenol', 'C₆H₆O', 'aromatic');
buildAromatic(benzenePos, ['NH2', 'H', 'H', 'H', 'H', 'H'], 'Aniline', 'C₆H₇N', 'aromatic');
buildAromatic(benzenePos, ['COOH', 'H', 'H', 'H', 'H', 'H'], 'Benzoic acid', 'C₇H₆O₂', 'aromatic');
buildAromatic(benzenePos, ['CHO', 'H', 'H', 'H', 'H', 'H'], 'Benzaldehyde', 'C₇H₆O', 'aromatic');
buildAromatic(benzenePos, ['OCH3', 'H', 'H', 'H', 'H', 'H'], 'Anisole', 'C₇H₈O', 'aromatic');
buildAromatic(benzenePos, ['C2H5', 'H', 'H', 'H', 'H', 'H'], 'Ethylbenzene', 'C₈H₁₀', 'aromatic');
buildAromatic(benzenePos, ['Cl', 'H', 'H', 'H', 'H', 'H'], 'Chlorobenzene', 'C₆H₅Cl', 'aromatic');

console.log(`✅ Generated ${Object.keys(MOLECULES).length} molecules`);

// ---- BUILD MOLECULE ----
function buildMolecule(key) {
    moleculeGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
        if (child.isCSS2DObject) child.element.remove();
    });
    while (moleculeGroup.children.length) moleculeGroup.remove(moleculeGroup.children[0]);

    const data = MOLECULES[key];
    if (!data) {
        statusEl.textContent = '❌ Molecule not found!';
        return;
    }

    data.atoms.forEach((atom) => {
        const radius = RADII[atom.elem] || 0.4;
        const color = COLORS[atom.elem] || 0xffffff;
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 32, 32),
            new THREE.MeshPhysicalMaterial({
                color,
                metalness: 0.1,
                roughness: 0.3,
                clearcoat: 0.2,
                emissive: new THREE.Color(color).multiplyScalar(0.1)
            })
        );
        sphere.position.set(atom.pos[0], atom.pos[1], atom.pos[2]);
        sphere.castShadow = true;
        moleculeGroup.add(sphere);

        const div = document.createElement('div');
        div.textContent = atom.elem;
        div.style.cssText =
            'color:#fff;font-size:14px;font-weight:bold;text-shadow:0 0 15px rgba(0,0,0,0.9);background:rgba(10,15,30,0.6);padding:2px 8px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);font-family:Quicksand, sans-serif;pointer-events:none;';
        const label = new CSS2DObject(div);
        label.position.set(atom.pos[0], atom.pos[1] + radius + 0.25, atom.pos[2]);
        moleculeGroup.add(label);
    });

    data.bonds.forEach(bond => {
        const start = data.atoms[bond[0]];
        const end = data.atoms[bond[1]];
        const order = bond[2] || 1;
        const startVec = new THREE.Vector3(start.pos[0], start.pos[1], start.pos[2]);
        const endVec = new THREE.Vector3(end.pos[0], end.pos[1], end.pos[2]);
        const direction = new THREE.Vector3().subVectors(endVec, startVec);
        const length = direction.length();
        if (length < 0.01) return;
        direction.normalize();

        const makeBond = (offsetVec, radius = 0.06) => {
            const startOff = startVec.clone().add(offsetVec);
            const endOff = endVec.clone().add(offsetVec);
            const mid = new THREE.Vector3().addVectors(startOff, endOff).multiplyScalar(0.5);
            const cyl = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, length, 6),
                new THREE.MeshPhysicalMaterial({ color: BOND_COLOR, metalness: 0.3, roughness: 0.6 })
            );
            cyl.position.copy(mid);
            cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            moleculeGroup.add(cyl);
        };

        if (order === 2) {
            const perp = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
            if (perp.length() < 0.1) perp.set(0, -direction.z, direction.y).normalize();
            makeBond(perp.clone().multiplyScalar(-0.12), 0.05);
            makeBond(perp.clone().multiplyScalar(0.12), 0.05);
        } else if (order === 3) {
            const perp1 = new THREE.Vector3(1, 0, 0).cross(direction).normalize();
            if (perp1.length() < 0.1) perp1.set(1, 0, 0);
            const perp2 = new THREE.Vector3().crossVectors(direction, perp1).normalize();
            makeBond(perp2.clone().multiplyScalar(-0.18), 0.04);
            makeBond(new THREE.Vector3(0, 0, 0), 0.04);
            makeBond(perp2.clone().multiplyScalar(0.18), 0.04);
        } else {
            makeBond(new THREE.Vector3(0, 0, 0), 0.06);
        }
    });

    statusEl.textContent = `🔬 ${data.name} (${data.formula})`;
    moleculeGroup.rotation.set(0, 0, 0);
    moleculeGroup.scale.set(1, 1, 1);
    prevHandX = 0;
    prevHandY = 0;
    pinchDistance = 0;
}

// ---- SEARCH & FILTER ----
let currentFilter = 'all';
let currentIndex = 0;

function getFilteredMolecules() {
    const query = searchBox.value.toLowerCase().trim();
    return Object.keys(MOLECULES).filter(key => {
        const mol = MOLECULES[key];
        const matchesSearch = mol.name.toLowerCase().includes(query);
        const matchesCategory = currentFilter === 'all' || mol.category === currentFilter;
        return matchesSearch && matchesCategory;
    });
}

function updateMoleculeList() {
    const results = getFilteredMolecules();
    if (results.length > 0) {
        currentIndex = Math.min(currentIndex, results.length - 1);
        buildMolecule(results[currentIndex]);
    } else {
        statusEl.textContent = '❌ No molecules found. Try a different search!';
    }
}

searchBox.addEventListener('input', () => { currentIndex = 0; updateMoleculeList(); });

document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.cat;
        currentIndex = 0;
        updateMoleculeList();
    });
});

document.addEventListener('keydown', (e) => {
    const results = getFilteredMolecules();
    if (results.length === 0) return;
    if (e.key === 'ArrowRight') {
        currentIndex = (currentIndex + 1) % results.length;
        buildMolecule(results[currentIndex]);
    } else if (e.key === 'ArrowLeft') {
        currentIndex = (currentIndex - 1 + results.length) % results.length;
        buildMolecule(results[currentIndex]);
    }
});

// ---- HAND TRACKING with Camera Preview ----
function initHandTracking() {
    const HandsGlobal = window.Hands;
    const CameraGlobal = window.Camera;

    if (!HandsGlobal || !CameraGlobal) {
        console.warn('MediaPipe not available — using mouse controls.');
        statusEl.textContent = '🖱️ Use mouse to drag & scroll.';
        cameraStatus.textContent = '❌ MediaPipe not loaded';
        cameraStatus.className = 'error';
        cameraPreview.classList.add('no-camera');
        controls.enabled = true;
        loadingEl.style.display = 'none';
        return;
    }

    try {
        const hands = new HandsGlobal({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
        });
        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7
        });

        hands.onResults((results) => {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                controls.enabled = false;
                const lm = results.multiHandLandmarks[0];
                const wrist = lm[0],
                    indexTip = lm[8],
                    thumbTip = lm[4];

                if (prevHandX !== 0) {
                    moleculeGroup.rotation.y += (wrist.x - prevHandX) * 4;
                    moleculeGroup.rotation.x += (wrist.y - prevHandY) * 4;
                    moleculeGroup.rotation.x = Math.max(-1.2, Math.min(1.2, moleculeGroup.rotation.x));
                }
                prevHandX = wrist.x;
                prevHandY = wrist.y;

                const dist = Math.sqrt(
                    (indexTip.x - thumbTip.x) ** 2 +
                    (indexTip.y - thumbTip.y) ** 2 +
                    (indexTip.z - thumbTip.z) ** 2
                );
                if (pinchDistance === 0) pinchDistance = dist;
                let scale = moleculeGroup.scale.x + (dist - pinchDistance) * 6;
                scale = Math.max(0.4, Math.min(2.0, scale));
                moleculeGroup.scale.set(scale, scale, scale);
                pinchDistance = dist;

                const fingers = [
                    thumbTip.y < lm[3].y,
                    indexTip.y < lm[6].y,
                    lm[12].y < lm[10].y,
                    lm[16].y < lm[14].y,
                    lm[20].y < lm[18].y
                ];
                if (fingers.filter(Boolean).length >= 4) {
                    if (!resetTimer) {
                        resetTimer = setTimeout(() => {
                            moleculeGroup.rotation.set(0, 0, 0);
                            moleculeGroup.scale.set(1, 1, 1);
                            statusEl.textContent = '🔄 View Reset!';
                            setTimeout(() => statusEl.textContent = '🤚 Show open palm to reset view', 1500);
                            resetTimer = null;
                        }, 1200);
                    }
                } else {
                    if (resetTimer) { clearTimeout(resetTimer);
                        resetTimer = null; }
                }
                statusEl.textContent = '✋ Hand detected!';
                cameraStatus.textContent = '✋ Hand detected';
                cameraStatus.className = 'active';
                cameraPreview.classList.add('active');
            } else {
                controls.enabled = true;
                pinchDistance = 0;
                prevHandX = 0;
                prevHandY = 0;
                if (resetTimer) { clearTimeout(resetTimer);
                    resetTimer = null; }
                statusEl.textContent = '🤚 Show open palm to reset view';
                cameraStatus.textContent = '👋 Show your hand';
                cameraStatus.className = '';
                cameraPreview.classList.remove('active');
            }
        });

        // Create video element and attach to preview wrapper
        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.transform = 'scaleX(-1)';
        videoWrapper.innerHTML = '';
        videoWrapper.appendChild(video);

        const camera = new CameraGlobal(video, {
            onFrame: async () => {
                try { await hands.send({ image: video }); } catch (e) { /* ignore */ }
            },
            width: 640,
            height: 480,
            facingMode: "user"
        });

        camera.start()
            .then(() => {
                handTrackingActive = true;
                loadingEl.style.display = 'none';
                statusEl.textContent = '📷 Camera active! Show your hand.';
                cameraStatus.textContent = '✅ Camera ready';
                cameraStatus.className = 'active';
                cameraPreview.classList.remove('no-camera');
                console.log('📷 Camera started successfully.');
            })
            .catch((err) => {
                console.warn('Camera start failed:', err);
                handTrackingActive = false;
                loadingEl.style.display = 'none';
                statusEl.textContent = '🖱️ Camera unavailable. Use mouse to drag & scroll.';
                cameraStatus.textContent = '❌ Camera unavailable';
                cameraStatus.className = 'error';
                cameraPreview.classList.add('no-camera');
                controls.enabled = true;
            });

    } catch (err) {
        console.warn('Hand tracking init error:', err);
        handTrackingActive = false;
        loadingEl.style.display = 'none';
        statusEl.textContent = '🖱️ Use mouse to drag & scroll.';
        cameraStatus.textContent = '❌ Error: ' + err.message;
        cameraStatus.className = 'error';
        cameraPreview.classList.add('no-camera');
        controls.enabled = true;
    }
}

// ---- RESIZE ----
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- ANIMATION ----
function animate() {
    requestAnimationFrame(animate);
    particles.rotation.y += 0.0002;
    if (autoRotate) moleculeGroup.rotation.y += 0.005;
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

// ---- START ----
try {
    const keys = Object.keys(MOLECULES);
    if (keys.length === 0) throw new Error('No molecules generated!');
    buildMolecule(keys[0]);
    setTimeout(initHandTracking, 300);
    animate();
    setTimeout(() => { loadingEl.style.display = 'none'; }, 1500);
} catch (err) {
    console.error('Startup error:', err);
    loadingEl.style.display = 'none';
    statusEl.textContent = '⚠️ Error: ' + err.message;
    controls.enabled = true;
}