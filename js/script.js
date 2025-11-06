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
let currentGazeTarget = null;
let gazeDwellTime = 0;
const DWELL_TIME_THRESHOLD = 1.5; // Tiempo (segundos) para "hacer clic" con la mirada

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
    camera.position.set(0, 1.6, 5); 

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setAnimationLoop(animate);
    renderer.xr.enabled = true;
    document.body.appendChild(VRButton.createButton(renderer));
    container.appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();
    interactableGroup = new THREE.Group();
    // --- ¡CAMBIO 1: BOTONES YA NO SE PEGAN A LA CÁMARA! ---
    // La línea "camera.add(interactableGroup);" se ha ELIMINADO de aquí.

    // --- El "Cursor" (Retícula de Mirada) ---
    // Este se queda pegado a la cámara (esto SÍ es correcto).
    const reticleGeo = new THREE.CircleGeometry(0.015, 16); // Tamaño grande
    const reticleMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        fog: false,
        depthTest: false,
        transparent: true,
        opacity: 0.8
    });
    reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.position.z = -0.5; // Fijo 0.5m delante de la cámara
    reticle.renderOrder = 999;
    camera.add(reticle); // <-- El cursor SÍ se añade a la cámara

    renderer.xr.addEventListener('sessionstart', updateUIVisibility);
    renderer.xr.addEventListener('sessionend', updateUIVisibility);

    // Botones HTML (para 2D con mouse/dedo)
    btnToEnv1.onclick = () => switchScene('ESCENARIO_1');
    btnToEnv2.onclick = () => switchScene('ESCENARIO_2');
    btnToMenu.onclick = () => switchScene('MENU');

    window.addEventListener('resize', onWindowResize);
    switchScene('MENU');
}

// --- Bucle de Animación ---
function animate() {
    const delta = clock.getDelta();

    if (controls) controls.update(delta); 
    if (mixer) mixer.update(delta); 

    // Esta función hace que el "cursor estático" funcione en VR
    handleGazeInteraction(delta);

    renderer.render(scene, camera);
}

// --- Manejador de Estado (Cambio de Escena) ---
function switchScene(newState) {
    currentState = newState;

    scene.clear();
    interactableGroup.clear(); 
    if (mixer) mixer = null;
    if (controls) {
        controls.dispose();
        controls = null;
    }

    scene.add(camera); 

    // --- ¡CAMBIO 2: AÑADIR BOTONES A LA ESCENA (AL MUNDO)! ---
    // Ahora los botones se añaden a la escena, no a la cámara.
    scene.add(interactableGroup);
    // Los posicionamos flotando en el mundo, a nivel de los ojos (1.6m)
    // y 2.5m enfrente de donde inicias.
    interactableGroup.position.set(0, 1.6, -2.5);
    
    // Luces genéricas
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(1, 2, 3);
    scene.add(dirLight);

    currentGazeTarget = null;
    gazeDwellTime = 0;

    switch (newState) {
        case 'MENU':
            setupMenu();
            createVRMenu();
            break;
        case 'ESCENARIO_1':
            setupEscenario1(); // No se toca
            createVRGameUI();
            break;
        case 'ESCENARIO_2':
            setupEscenario2(); // No se toca
            createVRGameUI();
            break;
    }
    updateUIVisibility();
}

// --- Configuración de Escenas ---
function setupMenu() {
    scene.background = new THREE.Color(0x101010);
    camera.position.set(0, 1.6, 3);
    
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshNormalMaterial();
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 1.6, -2); 
    scene.add(cube);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.6, -2);
    controls.enableDamping = true;
}

// --- ESCENARIO 1 (NO SE TOCA) ---
function setupEscenario1() {
    scene.background = new THREE.Color(0x88ccee); 
    camera.position.set(5, 2.0, 5); 
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-10, 1.0, 0); 
    controls.enableDamping = true;
    
    const loader = new GLTFLoader();
    loader.load('models/bus_stop.glb', (gltf) => {
        gltf.scene.scale.set(1, 1, 1);
        gltf.scene.position.x = -10;
        gltf.scene.position.y = 0; 
        gltf.scene.position.z = 0;
        scene.add(gltf.scene);
    });
}

// --- ESCENARIO 2 (NO SE TOCA) ---
function setupEscenario2() {
    scene.background = new THREE.Color(0x101010); 

    // Cámara 2D
    camera.position.set(0, 1.6, 5); 
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-1.5, 1, -3); 
    controls.enableDamping = true;
    
    const fbxLoader = new FBXLoader();
    fbxLoader.load('models/KGR.fbx', (fbxModel) => {
        
        fbxModel.scale.set(0.015, 0.015, 0.015);
        fbxModel.position.set(-1.5, 0.1, -3); 
        fbxModel.rotation.y = 0; 
        
        scene.add(fbxModel);

        const animLoader = new FBXLoader();
        animLoader.load('models/Silly Dancing.fbx', (fbxAnim) => {
            mixer = new THREE.AnimationMixer(fbxModel);
            mixer.clipAction(fbxAnim.animations[0]).play();
        });
    });
}

// --- Funciones de UI VR (Botones 3D) ---
function createButtonMesh(text, name, yPos) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    ctx.fillStyle = '#000000'; 
    ctx.strokeStyle = '#00ffff'; 
    ctx.lineWidth = 15;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ffff'; 
    ctx.font = 'bold 50px Courier New'; 
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
    // --- ¡CAMBIO 3: POSICIÓN DEL BOTÓN RELATIVA AL GRUPO! ---
    // Ahora se posicionan verticalmente (yPos) dentro del grupo,
    // ya que el grupo (interactableGroup) es el que está posicionado en -2.5z.
    mesh.position.set(0, yPos, 0); 
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

// --- Manejador de Visibilidad (HTML vs VR) ---
function updateUIVisibility() {
    const isVR = renderer.xr.isPresenting;
    
    reticle.visible = isVR;
    interactableGroup.visible = isVR;
    
    uiMenu.style.display = (!isVR && currentState === 'MENU') ? 'flex' : 'none';
    uiGame.style.display = (!isVR && currentState !== 'MENU') ? 'flex' : 'none';

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

// --- Interacción por Mirada (Gaze) ---
function handleGazeInteraction(delta) {
    if (!renderer.xr.isPresenting) return; // Solo funciona en VR

    raycaster.setFromCamera({ x: 0, y: 0 }, camera); 
    // ¡Ahora el rayo SÍ puede chocar con los botones,
    // porque los botones están en la escena (en el mundo)
    // y el rayo sale de la cámara!
    const intersects = raycaster.intersectObjects(interactableGroup.children);

    let target = null;
    if (intersects.length > 0) {
        target = intersects[0].object; 
    }

    interactableGroup.children.forEach(child => child.scale.set(1, 1, 1));

    if (target !== currentGazeTarget) {
        currentGazeTarget = target;
        gazeDwellTime = 0; 
    }

    if (currentGazeTarget) {
        currentGazeTarget.scale.set(1.2, 1.2, 1.2); 
        gazeDwellTime += delta; 

        if (gazeDwellTime >= DWELL_TIME_THRESHOLD) {
            onGazeSelect(currentGGazeTarget); 
            gazeDwellTime = 0; 
        }
    }
}

// Esta es la función de "clic" para la mirada
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
