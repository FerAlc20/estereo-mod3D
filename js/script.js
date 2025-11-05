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
const contentHolder = new THREE.Group();

// --- Variables para VR y Controles ---
let playerRig; 
let controller1, controller2;
let controllerGrip1, controllerGrip2;

let raycaster;
let teleportMarker; 
let groundPlane; 
const tempMatrix = new THREE.Matrix4();

// --- Variables para UI en VR ---
let uiButtonsArray = [];
let controllerPointer; // Láser del control

// --- Variables para Movimiento Suave ---
const speed = 2.0; 
const direction = new THREE.Vector3();
const strafe = new THREE.Vector3();

// --- 3. Función Principal de Inicialización ---
init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 0); // Altura de ojos
    
    playerRig = new THREE.Group();
    playerRig.position.set(0, 0, 0); // El jugador NUNCA se mueve de (0,0,0)
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
    document.body.appendChild(VRButton.createButton(renderer));

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.6, -1); // Mirar 1m adelante
    controls.update();

    scene.add(contentHolder);
    
    setupVR();
    
    // Crear la Interfaz en 3D
    createVRUI();

    window.addEventListener('resize', onWindowResize);
    
    // Cargar el escenario por defecto al inicio
    loadScene(); 

    renderer.setAnimationLoop(animate);
}

// --- Función para Crear Botones en 3D ---
function createVRUI() {
    // Función para crear el texto del botón
    function createButtonTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.strokeStyle = '#00ffff';
        context.lineWidth = 10;
        context.strokeRect(0, 0, canvas.width, canvas.height);
        
        context.fillStyle = '#00ffff';
        context.font = 'bold 40px Courier New';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        return new THREE.CanvasTexture(canvas);
    }

    // Botón 1: Escenario
    const btnGeo = new THREE.PlaneGeometry(1, 0.25); // 1m de ancho, 25cm de alto
    const btnMatScene = new THREE.MeshBasicMaterial({ 
        map: createButtonTexture('VER ESCENARIO'),
        transparent: true
    });
    const btnMeshScene = new THREE.Mesh(btnGeo, btnMatScene);
    btnMeshScene.position.set(-0.6, 1.6, -2); // 2m delante, 1.6m alto, 0.6m izquierda
    btnMeshScene.onClick = () => loadScene(); // Función de Clic
    scene.add(btnMeshScene);
    uiButtonsArray.push(btnMeshScene);

    // Botón 2: Personaje
    const btnMatChar = new THREE.MeshBasicMaterial({
        map: createButtonTexture('VER PERSONAJE'),
        transparent: true
    });
    const btnMeshChar = new THREE.Mesh(btnGeo, btnMatChar);
    btnMeshChar.position.set(0.6, 1.6, -2); // 2m delante, 1.6m alto, 0.6m derecha
    btnMeshChar.onClick = () => loadCharacter(); // Función de Clic
    scene.add(btnMeshChar);
    uiButtonsArray.push(btnMeshChar);
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

    // --- Controlador 1 (con puntero) ---
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    playerRig.add(controller1);

    // --- Puntero Láser ---
    const pointerGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -5) // 5m de largo
    ]);
    const pointerMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
    controllerPointer = new THREE.Line(pointerGeo, pointerMat);
    controller1.add(controllerPointer);

    controllerGrip1 = renderer.xr.getControllerGrip(0);
    const controllerModelFactory = new XRControllerModelFactory();
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    playerRig.add(controllerGrip1);

    // --- Controlador 2 ---
    controller2 = renderer.xr.getController(1);
    playerRig.add(controller2);
    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    playerRig.add(controllerGrip2);
}

// --- Funciones de Eventos de Control ---

function onSelectStart(event) {
    // Guardamos que estamos teletransportando/clickeando
    const controller = event.target;
    controller.userData.teleporting = true;
}

function onSelectEnd(event) {
    const controller = event.target;
    controller.userData.teleporting = false;

    // --- LÓGICA DE CLIC ACTUALIZADA ---
    // 1. Configurar raycaster desde el control
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    // 2. ¿Chocamos con un botón?
    const uiIntersects = raycaster.intersectObjects(uiButtonsArray);
    if (uiIntersects.length > 0) {
        // ¡SÍ! Haz clic en el botón
        uiIntersects[0].object.onClick();
        teleportMarker.visible = false;
    
    } else if (teleportMarker.visible) {
        // NO. ¿Estábamos apuntando al suelo? Teletransporte.
        playerRig.position.set(teleportMarker.position.x, 0, teleportMarker.position.z);
        teleportMarker.visible = false;
    } else {
        // No hacíamos nada
        teleportMarker.visible = false;
    }
}

// --- Lógica del Raycaster en cada frame ---
function handleControllerRaycast(controller) {
    if (!controller.visible) return;

    // 1. Configurar raycaster
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    
    // 2. Resetear resaltado de botones
    uiButtonsArray.forEach(btn => btn.material.color.set(0xffffff));
    controllerPointer.material.color.set(0x00ffff); // Resetear color láser

    // 3. Comprobar intersecciones UI
    const uiIntersects = raycaster.intersectObjects(uiButtonsArray);
    if (uiIntersects.length > 0) {
        // Resaltar botón
        uiIntersects[0].object.material.color.set(0x00ff00); // Verde
        controllerPointer.material.color.set(0x00ff00); // Láser verde
        teleportMarker.visible = false;

    } else if (controller.userData.teleporting === true) {
        // 4. Si no hay UI, comprobar suelo (solo si el gatillo está presionado)
        const groundIntersects = raycaster.intersectObjects([groundPlane, contentHolder], true); 
        if (groundIntersects.length > 0) {
            teleportMarker.position.copy(groundIntersects[0].point);
            teleportMarker.visible = true;
        } else {
            teleportMarker.visible = false;
        }
    } else {
        teleportMarker.visible = false;
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
    // Ocultamos los botones
    uiButtonsArray.forEach(btn => btn.visible = false);
}

function loadScene() {
    clearContent();
    uiButtonsArray.forEach(btn => btn.visible = true);
    
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
    uiButtonsArray.forEach(btn => btn.visible = true);

    const fbxLoader = new FBXLoader();
    fbxLoader.load(
        'models/KGR.fbx',
        (fbxModel) => {
            console.log("Modelo KGR cargado.");
            
            fbxModel.scale.set(0.02, 0.02, 0.02); // Escala
            
            // --- ¡AQUÍ ESTÁ EL AJUSTE MANUAL! ---
            // Ajusta el primer valor (X) para centrarlo horizontalmente.
            // Si tienes que girar a la DERECHA, hazlo más negativo (ej. -1.5)
            // Si tienes que girar a la IZQUIERDA, hazlo más positivo (ej. -0.5 o 0)
            fbxModel.position.set(-1.0, 0.1, -3); 
            
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
        handleControllerRaycast(controller1); 
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
