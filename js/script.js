// --- 1. Importaciones de Módulos de Three.js ---
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
// Usamos el VRButton estándar, como pediste
import { VRButton } from 'three/addons/webxr/VRButton.js';


// --- 2. Configuración Global ---
let camera, scene, renderer;
let controls;
let mixer; // Para las animaciones
const clock = new THREE.Clock();
const contentHolder = new THREE.Group();

// --- Variables para VR y Controles ---
let playerRig; 
let controller1, controller2;
// ¡ELIMINADO! controllerGrip1, controllerGrip2

let raycaster;
let teleportMarker; 
let groundPlane; 
const tempMatrix = new THREE.Matrix4();



// --- Variables para Movimiento Suave ---
const speed = 2.0; 
const direction = new THREE.Vector3();
const strafe = new THREE.Vector3();

// --- NUEVO: Referencias a los botones HTML ---
const btnScene = document.getElementById('btnScene');
const btnCharacter = document.getElementById('btnCharacter');


// --- 3. Función Principal de Inicialización ---
init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 0); // Altura de ojos
    
    playerRig = new THREE.Group();
 
    playerRig.position.set(0, 0, 10); // 10 metros "atrás"
    playerRig.add(camera);
    scene.add(playerRig);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(2, 5, 5);
    scene.add(dirLight);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true; 
    document.body.appendChild(renderer.domElement);
    // Usa el botón estándar
    document.body.appendChild(VRButton.createButton(renderer));

    controls = new OrbitControls(camera, renderer.domElement);
    // Apuntar al centro del vecindario
    controls.target.set(0, 1.6, 0); 
    controls.update();

    scene.add(contentHolder);
    
    setupVR();
    


    // --- NUEVO: Listeners para los botones HTML ---
    btnScene.addEventListener('click', () => {
        loadScene();
        btnScene.classList.add('active');
        btnCharacter.classList.remove('active');
    });

    btnCharacter.addEventListener('click', () => {
        loadCharacter();
        btnScene.classList.remove('active');
        btnCharacter.classList.add('active');
    });
    // --- FIN DE LISTENERS ---

    window.addEventListener('resize', onWindowResize);
    
    // Cargar el escenario por defecto al inicio
    loadScene(); 

    renderer.setAnimationLoop(animate);
}


// --- Configuración de Controles VR ---
function setupVR() {
    // Suelo Invisible
    const groundGeometry = new THREE.PlaneGeometry(100, 100); 
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.0 });
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.position.y = 0; 
    scene.add(groundPlane); 

    // Marcador de Teletransporte
    const markerGeometry = new THREE.RingGeometry(0.25, 0.3, 32);
    markerGeometry.rotateX(-Math.PI / 2);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    teleportMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    teleportMarker.visible = false;
    scene.add(teleportMarker);

    raycaster = new THREE.Raycaster();

    // --- Controlador 1 (solo para lógica) ---
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    playerRig.add(controller1);



    // --- Controlador 2 (solo para lógica) ---
    controller2 = renderer.xr.getController(1);
    // Añadimos listeners al control 2 también
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    playerRig.add(controller2);
    // ¡ELIMINADO! Modelo de control 2
}

// --- Funciones de Eventos de Control ---

function onSelectStart(event) {
    const controller = event.target;
    controller.userData.teleporting = true;
}

function onSelectEnd(event) {
    const controller = event.target;
    controller.userData.teleporting = false;

    // --- LÓGICA DE CLIC SIMPLIFICADA ---
    // Si el marcador era visible, teletransporta
    if (teleportMarker.visible) {
        playerRig.position.set(teleportMarker.position.x, 0, teleportMarker.position.z);
        teleportMarker.visible = false;
    }
}

// --- Lógica del Raycaster (solo teletransporte) ---
function handleTeleportRaycast(controller) {
    if (!controller.visible) return;

    // Solo mostrar el rayo si el gatillo está presionado
    if (controller.userData.teleporting === true) {
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        // Comprobar suelo
        const groundIntersects = raycaster.intersectObjects([groundPlane, contentHolder], true); 
        if (groundIntersects.length > 0) {
            teleportMarker.position.copy(groundIntersects[0].point);
            teleportMarker.visible = true;
        } else {
            teleportMarker.visible = false;
        }
    } else {
        teleportMarker.visible = false; // Ocultar si no se presiona el gatillo
    }
}

// --- Manejador de Movimiento con Thumbstick ---
function handleThumbstickMovement(delta) {
    const session = renderer.xr.getSession();
    if (!session || !session.inputSources) return;
    let moveVector = new THREE.Vector2();
    for (const source of session.inputSources) {
        // Asumir que el control izquierdo es para moverse
        if (source.gamepad && source.gamepad.axes.length >= 4 && source.handedness === 'left') {
            moveVector.x = source.gamepad.axes[2];
            moveVector.y = source.gamepad.axes[3];
            if (Math.abs(moveVector.x) < 0.1) moveVector.x = 0;
            if (Math.abs(moveVector.y) < 0.1) moveVector.y = 0;
            if (moveVector.x !== 0 || moveVector.y !== 0) break;
        }
    }
    if (moveVector.x === 0 && moveVector.y === 0) return;
    camera.getWorldDirection(direction);
    direction.y = 0; 
    direction.normalize();
    strafe.crossVectors(camera.up, direction).multiplyScalar(-1);
    const forwardMove = direction.clone().multiplyScalar(-moveVector.y * speed * delta);
    const strafeMove = strafe.clone().multiplyScalar(moveVector.x * speed * delta);
    playerRig.position.add(forwardMove).add(strafeMove);
}

// --- 4. Funciones de Carga de Contenido ---

function clearContent() {
    if (mixer) {
        mixer.stopAllAction();
        mixer = null;
    }
    while (contentHolder.children.length > 0) {
        contentHolder.remove(contentHolder.children[0]);
    }
    // ¡ELIMINADO! uiButtonsArray.forEach...
}

function loadScene() {
    clearContent();
    
    // Posicionar el escenario en el origen.
    // Como el playerRig está en (0,0,10), lo verá de frente.
    contentHolder.position.set(0, 0, 0); 

    const loader = new GLTFLoader();
    loader.load(
        'models/bus_stop.glb',
        (gltf) => {
            gltf.scene.scale.set(1, 1, 1);
            contentHolder.add(gltf.scene);
            console.log("Escenario cargado.");
        },
        undefined, 
        (error) => { console.error("Error cargando el escenario:", error); }
    );
}

function loadCharacter() {
    clearContent();
    
    // Posicionar el contentHolder en el origen
    // Como el playerRig está en (0,0,10), lo verá de frente
    contentHolder.position.set(0, 0, 0); 

    const fbxLoader = new FBXLoader();
    fbxLoader.load(
        'models/KGR.fbx',
        (fbxModel) => {
            console.log("Modelo KGR cargado.");
            
            fbxModel.scale.set(0.02, 0.02, 0.02); // Escala
            

            fbxModel.position.set(-1.0, 0.1, 0); 
            
            const animLoader = new FBXLoader();
            animLoader.load(
                'models/Silly Dancing.fbx',
                (fbxAnim) => {
                    console.log("Animación 'Silly Dancing' cargada.");
                    mixer = new THREE.AnimationMixer(fbxModel);
                    const action = mixer.clipAction(fbxAnim.animations[0]);
                    action.play();
                    contentHolder.add(fbxModel);
                },
                undefined,
                (error) => { console.error("Error cargando la animación:", error); }
            );
        },
        undefined,
        (error) => { console.error("Error cargando el modelo KGR:", error); }
    );
}

// --- 5. Bucle de Animación (Render Loop) ---

function animate() {
    const delta = clock.getDelta();

    if (mixer) {
        mixer.update(delta);
    }

    if (renderer.xr.isPresenting === false) {
        controls.update(); // Solo actualizar órbita si no estamos en VR
    }
    
    if (renderer.xr.isPresenting) {
        // Lógica de controles VR
        handleTeleportRaycast(controller1); 
        handleTeleportRaycast(controller2); 
        handleThumbstickMovement(delta);
    }

    renderer.render(scene, camera);
}

// --- 6. Manejador de Redimensión de Ventana ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
