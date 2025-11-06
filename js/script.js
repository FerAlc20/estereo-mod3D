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
const DWELL_TIME_THRESHOLD = 1.5;

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
    // Posición inicial de la cámara 2D. Se ajustará en cada escena.
    camera.position.set(0, 1.6, 5); 

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
    // Añadimos los botones a la CÁMARA
    camera.add(interactableGroup);

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
    reticle.position.z = -0.5; // Fijo delante de la cámara
    reticle.renderOrder = 999;
    camera.add(reticle);

    // 2. Listeners de sesión VR
    renderer.xr.addEventListener('sessionstart', updateUIVisibility);
    renderer.xr.addEventListener('sessionend', updateUIVisibility);

    // --- Eventos de la UI HTML ---
    // Explicación del "Cursor":
    // En 2D (PC/móvil), el "cursor" es tu MOUSE o DEDO.
    // Haces clic/tapas estos botones HTML.
    btnToEnv1.onclick = () => switchScene('ESCENARIO_1');
    btnToEnv2.onclick = () => switchScene('ESCENARIO_2');
    btnToMenu.onclick = () => switchScene('MENU');

    window.addEventListener('resize', onWindowResize);
    switchScene('MENU');
}

// --- Bucle de Animación ---
function animate() {
    const delta = clock.getDelta();

    if (controls) controls.update(delta); // Actualizar OrbitControls si existen
    
    if (mixer) mixer.update(delta); // Actualizar animación
    

    // Explicación del "Cursor VR":
    // En VR, los botones HTML desaparecen.
    // El "cursor" es el punto blanco (retícula) que se controla con TU MIRADA.
    // Lanza un rayo y si miras un botón 3D por 1.5 seg, se activa.
    handleGazeInteraction(delta);

    renderer.render(scene, camera);
}

// --- Manejador de Estado (Cambio de Escena) ---
function switchScene(newState) {
    currentState = newState;

    scene.clear();
    interactableGroup.clear(); // Los botones se borran del grupo
    if (mixer) mixer = null;
    if (controls) {
        controls.dispose();
        controls = null;
    }

    scene.add(camera); // Añadimos la cámara (que YA CONTIENE la retícula y el grupo de botones)
    
    // Luces genéricas para todas las escenas
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
    // Cámara 2D
    camera.position.set(0, 1.6, 3);
    
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshNormalMaterial();
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 1.6, -2); // Poner el cubo delante
    scene.add(cube);
    
    // Configurar controles 2D
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.6, -2);
    controls.enableDamping = true;
}

// --- ¡CORRECCIÓN ESCENARIO 1 (Bus Stop)! ---
function setupEscenario1() {
    scene.background = new THREE.Color(0x88ccee); // Cielo azul
    
    // 1. Configurar cámara 2D
    camera.position.set(5, 2.0, 5); // Vista 2D diagonal
    
    // 2. Configurar controles 2D para que miren al escenario
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-10, 1.0, 0); // Apuntar al escenario
    controls.enableDamping = true;
    
    const loader = new GLTFLoader();
    loader.load('models/bus_stop.glb', (gltf) => {
        gltf.scene.scale.set(1, 1, 1);
        
        // 3. ¡CORRECCIÓN DE POSICIÓN!
        // Movemos la escena a la izquierda, como pediste.
        // Esto funciona tanto en 2D como en VR (donde tú estás en 0,0,0).
        gltf.scene.position.x = -10;
        gltf.scene.position.y = 0; 
        gltf.scene.position.z = 0; // Lo dejamos en el origen Z
        
        scene.add(gltf.scene);
    });
}

// --- ¡CORRECCIÓN ESCENARIO 2 (Personaje)! ---
function setupEscenario2() {
    scene.background = new THREE.Color(0x101010); // Fondo oscuro

    // 1. Configurar cámara 2D
    camera.position.set(0, 1.6, 5); // Cámara 2D 5m atrás
    
    // 2. Configurar controles 2D para que miren al personaje
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, -3); // Apuntar al personaje en su nueva Z
    controls.enableDamping = true;
    
    const fbxLoader = new FBXLoader();
    fbxLoader.load('models/KGR.fbx', (fbxModel) => {
        
        fbxModel.scale.set(0.015, 0.015, 0.015);
        
        // 3. ¡CORRECCIÓN DE POSICIÓN!
        // Movemos el personaje 3m AL FRENTE de la cámara VR (que está en 0,0,0)
        fbxModel.position.set(0, 0.1, -3); 

        // 4. ¡CORRECCIÓN DE ROTACIÓN!
        // Lo rotamos 180 grados (Math.PI) para que te mire de FRENTE.
        fbxModel.rotation.y = Math.PI; 
        
        scene.add(fbxModel);

        // Cargar animación
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
        depthTest: false, // Para que siempre se vea
        renderOrder: 998 // Encima de todo
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    
    // Posiciona los botones 0.5m por debajo del centro de la vista
    mesh.position.set(0, yPos - 0.5, -2.5); // Fijos en la cámara

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
    
    // El cursor de GAZE (punto) y los botones 3D SÓLO son visibles en VR
    reticle.visible = isVR;
    interactableGroup.visible = isVR;
    
    // Los menús HTML SÓLO son visibles si NO estamos en VR
    uiMenu.style.display = (!isVR && currentState === 'MENU') ? 'flex' : 'none';
    uiGame.style.display = (!isVR && currentState !== 'MENU') ? 'flex' : 'none';

    // Actualizar texto del botón 2D "btn-to-other"
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
// ESTO es el "cursor" que funciona en VR
function handleGazeInteraction(delta) {
    if (!renderer.xr.isPresenting) return; // Solo funciona en VR

    raycaster.setFromCamera({ x: 0, y: 0 }, camera); // Lanza rayo desde el centro
    const intersects = raycaster.intersectObjects(interactableGroup.children);

    let target = null;
    if (intersects.length > 0) {
        target = intersects[0].object;
    }

    // Resaltar botón si se está mirando
    interactableGroup.children.forEach(child => child.scale.set(1, 1, 1));

    if (target !== currentGazeTarget) {
        currentGazeTarget = target;
        gazeDwellTime = 0; // Reiniciar contador
    }

    if (currentGazeTarget) {
        currentGazeTarget.scale.set(1.2, 1.2, 1.2); // Agrandar botón
        gazeDwellTime += delta;

        // Si se mira por 1.5 segundos, activar
        if (gazeDwellTime >= DWELL_TIME_THRESHOLD) {
            onGazeSelect(currentGazeTarget);
            gazeDwellTime = 0;
        }
    }
}

function onGazeSelect(selectedObject) {
    if (!selectedObject) return;

    // Simular clic
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
