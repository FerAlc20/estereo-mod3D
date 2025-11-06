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
const DWELL_TIME_THRESHOLD = 1.5; // 1.5 segundos (más rápido)

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
    const reticleGeo = new THREE.CircleGeometry(0.003, 16); // Un poco más grande
    const reticleMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff, // Color cian
        fog: false,
        depthTest: false, // Siempre visible
        transparent: true,
        opacity: 0.8
    });
    reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.position.z = -0.5; // Más cerca
    reticle.renderOrder = 999; // Renderizar encima de todo
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

    // Comprobar "hover" y "clic por mirada" en VR
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

    // Volver a añadir elementos persistentes
    scene.add(camera); // La cámara (con el retículo)
    scene.add(interactableGroup); // El grupo de botones

    // Resetear el estado de la mirada
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
    scene.background = new THREE.Color(0x101010); // Fondo oscuro
    camera.position.set(0, 1.6, 0.1); // Altura de ojos
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshNormalMaterial();
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 1.6, -2); // A la altura de los ojos
    scene.add(cube);
}

function setupEscenario1() {
    scene.background = new THREE.Color(0x88ccee);
    scene.add(new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(-5, 25, -1);
    scene.add(directionalLight);
    
    // Posición inicial fuera del "cuarto", a altura de ojos
    camera.position.set(0, 1.6, 5); 
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.6, 0); // Mirar al centro
    controls.enableDamping = true;
    
    const loader = new GLTFLoader();
    loader.load('models/bus_stop.glb', (gltf) => {
        // Escala que encontramos en pasos anteriores
        gltf.scene.scale.set(0.1, 0.1, 0.1);
        scene.add(gltf.scene);
    });
}

function setupEscenario2() {
    scene.background = new THREE.Color(0x101010); // Fondo oscuro
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(1, 2, 3);
    scene.add(dirLight);
    
    // Posición inicial del jugador
    camera.position.set(0, 1.6, 5); 
    
    controls = new OrbitControls(camera, renderer.domElement);
    // --- ¡CALIBRACIÓN! ---
    // Apuntar los controles de PC a la nueva posición del personaje
    controls.target.set(-1.0, 1, 0); // Apuntar a X=-1.0
    controls.enableDamping = true;
    
    // Cargar modelo FBX
    const fbxLoader = new FBXLoader();
    fbxLoader.load('models/KGR.fbx', (fbxModel) => {
        
        // --- ¡CALIBRACIÓN DE POSICIÓN IZQUIERDA! ---
        // Lo ponemos en X: -1.0 (más a la izquierda)
        // Y: 0.1 (sobre el suelo)
        // Z: 0 (en el centro, lo veremos desde Z=5)
        fbxModel.position.set(-1.0, 0.1, 0); 
        
        // Escala que encontramos en pasos anteriores
        fbxModel.scale.set(0.02, 0.02, 0.02);
        
        scene.add(fbxModel);

        // Cargar animación FBX
        const animLoader = new FBXLoader();
        animLoader.load('models/Silly Dancing.fbx', (fbxAnim) => {
            mixer = new THREE.AnimationMixer(fbxModel);
            mixer.clipAction(fbxAnim.animations[0]).play();
        });
    });
}

// --- Funciones de UI VR ---

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
        depthTest: false, // No comprueba la profundidad
        renderOrder: 998  // Renderiza casi al final
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    // Posiciona los botones a la altura de los ojos
    mesh.position.set(0, yPos + 1.0, -2.5); // 2.5m adelante

    return mesh;
}

function createVRMenu() {
    // Texto de botones actualizado
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
    reticle.visible = isVR; // El punto cian solo se ve en VR
    interactableGroup.visible = isVR; // Los botones 3D solo se ven en VR
    
    // Los menús HTML solo se ven si NO estamos en VR
    uiMenu.style.display = (isVR || currentState !== 'MENU') ? 'none' : 'flex';
    uiGame.style.display = (isVR || currentState === 'MENU') ? 'none' : 'flex';

    if (!isVR) {
        // Actualizar el texto del botón "otro" en 2D
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
    if (!renderer.xr.isPresenting) return; // Solo en VR

    // 1. Lanzar el rayo desde el centro de la cámara
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(interactableGroup.children);

    let target = null;
    if (intersects.length > 0) {
        target = intersects[0].object; // El objeto más cercano
    }

    // 2. Comprobar si estamos mirando un objeto nuevo o el mismo
    if (target !== currentGazeTarget) {
        currentGazeTarget = target;
        gazeDwellTime = 0; // Reiniciar temporizador
    }

    // 3. Resetear la escala de todos los botones
    interactableGroup.children.forEach(child => {
        child.scale.set(1, 1, 1);
        // (Podríamos cambiar el color aquí también)
    });

    // 4. Si hay un objetivo, manejar el "hover" y el "clic"
    if (currentGazeTarget) {
        // Efecto "hover": agrandar el botón
        currentGazeTarget.scale.set(1.2, 1.2, 1.2);

        // Incrementar el temporizador
        gazeDwellTime += delta;

        // 5. Comprobar si se cumplió el tiempo
        if (gazeDwellTime >= DWELL_TIME_THRESHOLD) {
            onGazeSelect(currentGazeTarget); // ¡Hacer clic!
            gazeDwellTime = 0; // Resetear para evitar clics múltiples
        }
    }
}

function onGazeSelect(selectedObject) {
    if (!selectedObject) return;

    // Cambia de escena según el nombre del botón
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
