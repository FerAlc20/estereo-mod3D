// --- 1. Importaciones de Módulos de Three.js ---
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js'; 

// --- 2. Configuración Global ---
let camera, scene, renderer;
let controls;
let mixer; // Para las animaciones
const clock = new THREE.Clock();

// Contenedor para los modelos 3D
const contentHolder = new THREE.Group();

// Referencias a los botones
const btnScene = document.getElementById('btnScene');
const btnCharacter = document.getElementById('btnCharacter');

// --- Variables para VR y Controles ---
let playerRig; 
let controller1, controller2;
let controllerGrip1, controllerGrip2;

let raycaster;
let teleportMarker; 
let groundPlane; 
const tempMatrix = new THREE.Matrix4();

// --- Variables para Movimiento Suave ---
const speed = 2.0; 
const direction = new THREE.Vector3();
const strafe = new THREE.Vector3();

// --- 3. Función Principal de Inicialización ---
init();

function init() {
    // --- Escena ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);

    // --- Cámara ---
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 0); // Altura de ojos
    
    // --- Player Rig ---
    playerRig = new THREE.Group();
    playerRig.position.set(0, 0, 0); // Empezar en el origen
    playerRig.add(camera);
    scene.add(playerRig);
    
    // --- Luces ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(2, 5, 5);
    scene.add(dirLight);

    // --- Renderer (Motor de renderizado) ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true; 
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    // --- Controles de Órbita (para escritorio) ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.6, -1); 
    controls.update();

    // --- Añadir Contenedor de Contenido ---
    scene.add(contentHolder);
    
    // --- Configuración de VR y Teletransporte ---
    setupVR();
    
    // --- Listeners (Eventos) ---
    window.addEventListener('resize', onWindowResize);
    btnScene.addEventListener('click', () => loadScene());
    btnCharacter.addEventListener('click', () => loadCharacter());

    // --- Cargar el escenario por defecto al inicio ---
    loadScene(); 

    // --- Iniciar el Bucle de Animación ---
    renderer.setAnimationLoop(animate);
}

// --- Configuración de Controles VR ---

function setupVR() {
    // --- Suelo Invisible para Teletransporte ---
    const groundGeometry = new THREE.PlaneGeometry(100, 100); 
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00, 
        transparent: true, 
        opacity: 0.0 
    });
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.position.y = 0; 
    scene.add(groundPlane); 

    // --- Marcador de Teletransporte ---
    const markerGeometry = new THREE.RingGeometry(0.25, 0.3, 32);
    markerGeometry.rotateX(-Math.PI / 2);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    teleportMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    teleportMarker.visible = false;
    scene.add(teleportMarker);

    // --- Raycaster ---
    raycaster = new THREE.Raycaster();

    // --- Controladores ---
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    playerRig.add(controller1);

    controllerGrip1 = renderer.xr.getControllerGrip(0);
    const controllerModelFactory = new XRControllerModelFactory();
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    playerRig.add(controllerGrip1);

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    playerRig.add(controller2);

    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    playerRig.add(controllerGrip2);
}

// --- Funciones de Eventos de Control ---

function onSelectStart(event) {
    const controller = event.target;
    controller.userData.teleporting = true;
}

function onSelectEnd(event) {
    const controller = event.target;
    controller.userData.teleporting = false;

    if (teleportMarker.visible) {
        playerRig.position.set(teleportMarker.position.x, 0, teleportMarker.position.z);
        teleportMarker.visible = false;
    }
}

// --- Lógica del Raycaster en cada frame ---

function handleTeleport(controller) {
    if (controller.userData.teleporting === true) {
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        const intersects = raycaster.intersectObjects([groundPlane, contentHolder], true); 

        if (intersects.length > 0) {
            teleportMarker.position.copy(intersects[0].point);
            teleportMarker.visible = true;
        } else {
            teleportMarker.visible = false;
        }
    }
}

// --- Manejador de Movimiento con Thumbstick ---

function handleThumbstickMovement(delta) {
    const session = renderer.xr.getSession();
    if (!session || !session.inputSources) return;

    let moveVector = new THREE.Vector2();

    for (const source of session.inputSources) {
        if (source.gamepad && source.gamepad.axes.length >= 4) {
            moveVector.x = source.gamepad.axes[2];
            moveVector.y = source.gamepad.axes[3];
            
            if (Math.abs(moveVector.x) < 0.1) moveVector.x = 0;
            if (Math.abs(moveVector.y) < 0.1) moveVector.y = 0;

            if (moveVector.x !== 0 || moveVector.y !== 0) {
                break;
            }
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
}

function loadScene() {
    clearContent();
    btnScene.classList.add('active');
    btnCharacter.classList.remove('active');

    // Poner al jugador en el origen para ESTAR DENTRO del escenario
    playerRig.position.set(0, 0, 0);

    const loader = new GLTFLoader();
    loader.load(
        'models/bus_stop.glb',
        (gltf) => {
            gltf.scene.scale.set(1, 1, 1);
            contentHolder.add(gltf.scene);
            console.log("Escenario cargado.");
        },
        undefined, 
        (error) => {
            console.error("Error cargando el escenario:", error);
        }
    );
}

function loadCharacter() {
    clearContent();
    btnScene.classList.remove('active');
    btnCharacter.classList.add('active');
    
    // Mover al jugador 3m HACIA ATRÁS para VER al personaje
    playerRig.position.set(0, 0, 3);

    const fbxLoader = new FBXLoader();
    fbxLoader.load(
        'models/KGR.fbx',
        (fbxModel) => {
            console.log("Modelo KGR cargado.");
            
            // Aumentamos la escala
            fbxModel.scale.set(0.01, 0.01, 0.01);
            
            // Ponemos el personaje en el origen (0,0,0)
            fbxModel.position.set(0, 0, 0); 

            
            fbxModel.rotation.y = Math.PI / 2; // (Math.PI / 2) son 90 grados
            
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
                (error) => {
                    console.error("Error cargando la animación:", error);
                }
            );
        },
        undefined,
        (error) => {
            console.error("Error cargando el modelo KGR:", error);
        }
    );
}

// --- 5. Bucle de Animación (Render Loop) ---

function animate() {
    const delta = clock.getDelta();

    if (mixer) {
        mixer.update(delta);
    }

    if (renderer.xr.isPresenting === false) {
        controls.update();
    }

    if (controller1.userData.teleporting !== true && controller2.userData.teleporting !== true) {
         teleportMarker.visible = false;
    }
    
    if (renderer.xr.isPresenting) {
        handleTeleport(controller1);
        handleTelepreport(controller2);
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
