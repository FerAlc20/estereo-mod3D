import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Variables Globales ---
let camera, scene, renderer, clock, mixer;
let controls;
let currentState = 'MENU';

// --- Variables para VR y Gaze ---
let reticle, raycaster, interactableGroup;
let currentGazeTarget = null; // Qué objeto estamos mirando
let gazeDwellTime = 0; // Cuánto tiempo lo hemos mirado
const DWELL_TIME_THRESHOLD = 1.5; // 1.5 segundos

// Elementos de la UI HTML
const uiMenu = document.getElementById('menu-ui');
const uiGame = document.getElementById('game-ui');
const btnToEnv1 = document.getElementById('btn-to-env1');
const btnToEnv2 = document.getElementById('btn-to-env2');
const btnToMenu = document.getElementById('btn-to-menu');
const btnToOther = document.getElementById('btn-to-other');
const container = document.getElementById('app-container');

// --- Inicialización ---
function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setAnimationLoop(animate);
    renderer.xr.enabled = true;
    document.body.appendChild(VRButton.createButton(renderer));
    container.appendChild(renderer.domElement);

    // --- Configuración de Interacción VR ---
    raycaster = new THREE.Raycaster();
    interactableGroup = new THREE.Group();
    scene.add(interactableGroup);

    // 1. El punto blanco (Retícula)
    const reticleGeo = new THREE.CircleGeometry(0.003, 16);
    const reticleMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        fog: false,
        depthTest: false,
        transparent: true,
        opacity: 0.8
    });
    reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.position.z = -0.5;
    reticle.renderOrder = 999;
    camera.add(reticle);

    // 2. Listeners de sesión VR
    renderer.xr.addEventListener('sessionstart', updateUIVisibility);
    renderer.xr.addEventListener('sessionend', updateUIVisibility);

    // --- Eventos de la UI HTML ---
    btnToEnv1.onclick = () => switchScene('ESCENARIO_1');
    btnToEnv2.onclick = () => switchScene('ESCENARIO_2');
    btnToMenu.onclick = () => switchScene('MENU');

    window.addEventListener('resize', onWindowResize);
    switchScene('MENU');
}

// --- Bucle de Animación ---
function animate() {
    const delta = clock.getDelta();

    if (currentState === 'ESCENARIO_1' || currentState === 'ESCENARIO_2') {
        if (controls) controls.update();
    }
    if (currentState === 'ESCENARIO_2') {
        if (mixer) mixer.update(delta);
    }

    handleGazeInteraction(delta);
    renderer.render(scene, camera);
}

// --- Manejador de Estado (Cambio de Escena) ---
function switchScene(newState) {
    currentState = newState;

    scene.clear();
    interactableGroup.clear();
    if (mixer) mixer = null;
    if (controls) controls.dispose();

    scene.add(camera);
    scene.add(interactableGroup);

    currentGazeTarget = null;
    gazeDwellTime = 0;

    switch (newState) {
        case 'MENU':
            setupMenu();
            createVRMenu();
            break;
        case 'ESCENARIO_1':
            setupEscenario1();
            createVRGameUI();
            break;
        case 'ESCENARIO_2':
            setupEscenario2();
            createVRGameUI();
            break;
    }
    updateUIVisibility();
}

// --- Configuración de Escenas ---
function setupMenu() {
    scene.background = new THREE.Color(0x101010);
    camera.position.set(0, 1.6, 0.1);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshNormalMaterial();
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 1.6, -2);
    scene.add(cube);
}

// --- ¡CORRECCIÓN 2: ESCENARIO (BUS STOP)! ---
function setupEscenario1() {
    scene.background = new THREE.Color(0x88ccee); // Cielo azul
    scene.add(new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(-5, 25, -1);
    scene.add(directionalLight);
    
    // 1. Poner la cámara a 1.6m (altura de ojos) y 5m atrás
    camera.position.set(0, 1.6, 5); 
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.6, 0); // Mirar al centro
    controls.enableDamping = true;
    
    const loader = new GLTFLoader();
    loader.load('models/bus_stop.glb', (gltf) => {
        // 2. Escalar el vecindario (0.1 = 10% del tamaño original)
        gltf.scene.scale.set(0.1, 0.1, 0.1);
        
        // 3. ¡LA CALLE A TUS PIES!
        // Bajar el escenario 1.6m para que el suelo
        // del modelo (Y=0) coincida con tus pies (Y=0)
        gltf.scene.position.y = -1.6; 
        
        scene.add(gltf.scene);
    });
}

// --- ¡CORRECCIÓN 3: PERSONAJE (KGR)! ---
function setupEscenario2() {
    scene.background = new THREE.Color(0x101010); // Fondo oscuro
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(1, 2, 3);
    scene.add(dirLight);
    
    // 1. Poner la cámara a altura de ojos y 5m atrás
    camera.position.set(0, 1.6, 5); 
    
    controls = new OrbitControls(camera, renderer.domElement);
    // 2. Apuntar la cámara 2D al personaje (que está en X: -1.0)
    controls.target.set(-1.0, 1, 0); 
    controls.enableDamping = true;
    
    const fbxLoader = new FBXLoader();
    fbxLoader.load('models/KGR.fbx', (fbxModel) => {
        
        // 3. ¡ESCALA CORREGIDA!
        // Ni muy grande (dentro) ni muy pequeño (punto).
        // 0.01 o 0.02 es buen valor. Empecemos con 0.01
        fbxModel.scale.set(0.01, 0.01, 0.01);
        
        // 4. ¡POSICIÓN A LA IZQUIERDA!
        // X: -1.0 (a la izquierda)
        // Y: 0.1 (sobre el suelo)
        // Z: 0 (5m en frente de la cámara)
        fbxModel.position.set(-1.0, 0.1, 0); 
        
        scene.add(fbxModel);

        // Cargar animación
        const animLoader = new FBXLoader();
        animLoader.load('models/Silly Dancing.fbx', (fbxAnim) => {
            mixer = new THREE.AnimationMixer(fbxModel);
            mixer.clipAction(fbxAnim.animations[0]).play();
        });
    });
}

// --- Funciones de UI VR (Estilo Retro) ---
function createButtonMesh(text, name, yPos) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    ctx.fillStyle = '#000000'; // Fondo negro
    ctx.strokeStyle = '#00ffff'; // Borde cian
    ctx.lineWidth = 15;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ffff'; // Texto cian
    ctx.font = 'bold 50px Courier New'; // Fuente retro
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(1, 0.25);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        renderOrder: 998
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(0, yPos + 1.0, -2.5); // Botones a altura de ojos

    return mesh;
}

function createVRMenu() {
    const btn1 = createButtonMesh('Ver Escenario', 'btn-to-env1', 0.3);
    const btn2 = createButtonMesh('Ver Personaje', 'btn-to-env2', 0);
    interactableGroup.add(btn1);
    interactableGroup.add(btn2);
}

function createVRGameUI() {
    const btnMenu = createButtonMesh('Volver al Menú', 'btn-to-menu', 0.3);
    interactableGroup.add(btnMenu);

    let text, name;
    if (currentState === 'ESCENARIO_1') {
        text = 'Ver Personaje';
        name = 'btn-to-env2';
    } else {
        text = 'Ver Escenario';
        name = 'btn-to-env1';
    }
    const btnOther = createButtonMesh(text, name, 0);
    interactableGroup.add(btnOther);
}

function updateUIVisibility() {
    const isVR = renderer.xr.isPresenting;
    reticle.visible = isVR;
    interactableGroup.visible = isVR;
    
    uiMenu.style.display = (isVR || currentState !== 'MENU') ? 'none' : 'flex';
    uiGame.style.display = (isVR || currentState === 'MENU') ? 'none' : 'flex';

    if (!isVR) {
        if (currentState === 'ESCENARIO_1') {
            btnToOther.innerText = 'Ver Personaje (KGR)';
            btnToOther.onclick = () => switchScene('ESCENARIO_2');
        } else if (currentState === 'ESCENARIO_2') {
            btnToOther.innerText = 'Ver Escenario (Bus Stop)';
            btnToOther.onclick = () => switchScene('ESCENARIO_1');
        }
    }
}

// --- Funciones de Interacción por Mirada (Gaze) ---
function handleGazeInteraction(delta) {
    if (!renderer.xr.isPresenting) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(interactableGroup.children);

    let target = null;
    if (intersects.length > 0) {
        target = intersects[0].object;
    }

    if (target !== currentGazeTarget) {
        currentGazeTarget = target;
        gazeDwellTime = 0;
    }

    interactableGroup.children.forEach(child => {
        child.scale.set(1, 1, 1);
    });

    if (currentGazeTarget) {
        currentGazeTarget.scale.set(1.2, 1.2, 1.2);
        gazeDwellTime += delta;

        if (gazeDwellTime >= DWELL_TIME_THRESHOLD) {
            onGazeSelect(currentGazeTarget);
            gazeDwellTime = 0;
        }
    }
}

function onGazeSelect(selectedObject) {
    if (!selectedObject) return;

    switch (selectedObject.name) {
        case 'btn-to-env1':
            switchScene('ESCENARIO_1');
            break;
        case 'btn-to-env2':
            switchScene('ESCENARIO_2');
            break;
        case 'btn-to-menu':
            switchScene('MENU');
            break;
    }
}

// --- Manejador de Redimensión ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
