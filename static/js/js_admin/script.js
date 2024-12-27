let selectedMarker = null;
let infoBoxVisible = false;
let isMobile = window.innerWidth < 768;
let allMarkers = [];
let allEdificios = [];
let markerGroups = new Map();
let selectedMarkerGroup = null;
let selectedLabelOverlay = null;


/*----------------------------Menu Desplegable-------------------------------------------------*/

document.addEventListener('DOMContentLoaded', function () {
    const menuToggle = document.getElementById('menu-toggle');
    const barraIzquierda = document.getElementById('barra_izquierda');

    menuToggle.addEventListener('click', function () {
        barraIzquierda.classList.toggle('active');
    });

    // Cerrar el menú al hacer clic fuera de él
    document.addEventListener('click', function (event) {
        if (!barraIzquierda.contains(event.target) && event.target !== menuToggle) {
            barraIzquierda.classList.remove('active');
        }
    });
});

/*------------------------------------------------------------------------------------*/

function toggleDropdown() {
    const dropdown = document.querySelector('.dropdown-menu');
    const button = document.querySelector('.user-button');
    dropdown.classList.toggle('show');
    button.classList.toggle('open');
}

document.addEventListener('click', (event) => {
    const isButton = event.target.closest('.user-button');
    const dropdown = document.querySelector('.dropdown-menu');

    if (!isButton && dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
        document.querySelector('.user-button').classList.remove('open');
    }
});

// Inicializar el mapa de Google
function initMap() {
    const map = new google.maps.Map(document.getElementById("map"), {
        zoom: 15,
        center: { lat: -34.985269, lng: -71.239421 },
        mapTypeControl: false,
        zoomControl: false,
        keyboardShortcuts: false,
        fullscreenControl: false,
        styles: [
            {
                featureType: "transit.station.airport",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            },
            {
                featureType: "landscape.natural",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            },
            {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            },
            {
                featureType: "transit.station.rail",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            },
            {
                featureType: "transit.station.bus",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            }
        ]
    });



    /*------------------------------------Funcion Marcadores, Info box y Barra busqueda------------------------------------------*/



    fetch('/get_edificios')
        .then(response => response.json())
        .then(data => {
            allEdificios = data;
            agregarMarcadores(data);
        })
        .catch(error => console.error('Error:', error));

    //Crea los marcadores en el mapa y controla la funcion de vista dependiendo de su zoom en el mapa
    function agregarMarcadores(edificios) {
        // Limpiar los marcadores existentes
        allMarkers.forEach(marker => marker.setMap(null));
        allMarkers = [];
        markerGroups.clear();

        // ZOOM_MARKERS define el nivel de zoom mínimo para mostrar los marcadores
        const ZOOM_MARKERS = 15;

        // Obtener el nivel de zoom actual
        const currentZoom = map.getZoom();

        edificios.forEach(edificio => {
            const position = { lat: parseFloat(edificio.latitud), lng: parseFloat(edificio.longitud) };

            // Crear marcador con imagen personalizada
            const customMarker = new google.maps.Marker({
                position: position,
                map: map,
                icon: {
                    url: `/static/images/marker/${edificio.tipo_edificio.toLowerCase()}.webp`,  // Ruta de la imagen WEBP
                    scaledSize: new google.maps.Size(30, 30),  // Tamaño del marcador
                    anchor: new google.maps.Point(15, 30)     // Punto de anclaje ajustado (centro inferior)
                },
                title: edificio.nombre,
                visible: currentZoom >= ZOOM_MARKERS // Mostrar según el nivel de zoom
            });

            // Almacenar el marcador en la lista de todos los marcadores
            allMarkers.push(customMarker);
            markerGroups.set(edificio.id, [customMarker]);


            // Evento de clic para mostrar detalles del edificio
            customMarker.addListener('click', () => handleMarkerClick([customMarker], edificio, null));
        });

        // Evento de zoom para mostrar u ocultar marcadores según el nivel de zoom
        google.maps.event.addListener(map, 'zoom_changed', function () {
            const zoom = map.getZoom();
            const ZOOM_THRESHOLD = 15; // Asegúrate de que este valor sea consistente

            allMarkers.forEach(marker => {
                if (!marker.wasHidden) {
                    marker.setVisible(zoom >= ZOOM_THRESHOLD);
                }
            });

            // Si hay un marcador seleccionado, asegurarse de que siga visible
            if (selectedMarker) {
                selectedMarker.setVisible(true);
            }
        });
    }

    //Funciona que asinga el icono seleccionado a una marcador
    function handleMarkerClick(markerGroup, edificio) {
        // Restore previously selected marker group
        if (selectedMarkerGroup) {
            restoreMarkerGroup(selectedMarkerGroup);
        }

        // Hide all markers of the current group
        markerGroup.forEach(marker => {
            if (marker instanceof google.maps.Marker) {
                marker.setVisible(false);
                marker.wasHidden = true; // Add this flag
            }
        });

        // Create the selection marker
        selectedMarker = new google.maps.Marker({
            position: markerGroup[0].getPosition(),
            map: map,
            icon: {
                path: 'M15,0 C9,0 4,5 4,11 C4,17 15,26 15,26 S26,17 26,11 C26,5 21,0 15,0 Z',
                fillColor: '#FF0000', // Rojo
                fillOpacity: 1,
                strokeWeight: 1,
                strokeColor: '#DDDDDD',
                scale: 1,
                anchor: new google.maps.Point(15, 26),
            },
            zIndex: google.maps.Marker.MAX_ZINDEX + 3
        });

        selectedMarker.setAnimation(google.maps.Animation.BOUNCE);

        // Save the selected marker group and label
        selectedMarkerGroup = markerGroup;

        // Set the visibility state of the selected marker
        selectedMarkerVisible = true;

        // Update and show InfoBox
        actualizarContenidoInfoBox(edificio);
        configurarListenersInfoBox(edificio);
        mostrarInfoBox();
    }

    //Restaura el marcador cuando este se cierra el marcador
    function restoreMarkerGroup(markerGroup) {
        // Restaurar la visibilidad de los marcadores originales
        markerGroup.forEach(marker => {
            if (marker instanceof google.maps.Marker) {
                marker.wasHidden = false;
                marker.setVisible(map.getZoom() >= 15);
            }
        });

        // Eliminar el marcador seleccionado actual si existe
        if (selectedMarker) {
            selectedMarker.setMap(null);
            selectedMarker = null;
        }

        // Reiniciar el grupo seleccionado
        selectedMarkerGroup = null;
    }

    // Función para filtrar edificios
    function filtrarEdificios(query) {
        query = query.toLowerCase();
        return allEdificios.filter(edificio =>
            edificio.nombre.toLowerCase().includes(query) ||
            edificio.direccion.toLowerCase().includes(query)
        );
    }

    // Función para actualizar marcadores visibles
    function actualizarMarcadoresVisibles(edificiosFiltrados) {
        // Primero ocultamos todos los marcadores
        allMarkers.forEach(marker => {
            if (marker instanceof google.maps.Marker) {
                marker.setVisible(false);
            } else if (marker instanceof google.maps.OverlayView) {
                marker.isHidden = true;
                marker.draw(); // Asegura que el labelOverlay también sea ocultado
            }
        });

        // Luego mostramos solo los marcadores de los edificios filtrados
        edificiosFiltrados.forEach(edificio => {
            allMarkers.forEach(marker => {
                if (marker instanceof google.maps.Marker &&
                    parseFloat(edificio.latitud) === marker.getPosition().lat() &&
                    parseFloat(edificio.longitud) === marker.getPosition().lng()) {
                    marker.setVisible(true);
                }
            });
        });
    }

    let lastSelectedEdificio = null; // Variable para almacenar el último edificio seleccionado
    //Muestra la sugerencia en la busqueda
    function mostrarSugerencias(edificiosFiltrados) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        suggestionsContainer.innerHTML = ''; // Limpiar sugerencias previas

        edificiosFiltrados.slice(0, 5).forEach(edificio => {
            const suggestion = document.createElement('div');
            suggestion.textContent = `${edificio.nombre} - ${edificio.direccion}`;
            suggestion.classList.add('search-suggestion');

            suggestion.addEventListener('click', () => {
                document.getElementById('searchInput').value = edificio.nombre;
                suggestionsContainer.innerHTML = ''; // Limpiar las sugerencias tras selección

                // Centrar el mapa en el edificio seleccionado
                const position = new google.maps.LatLng(parseFloat(edificio.latitud), parseFloat(edificio.longitud));
                map.setCenter(position);
                map.setZoom(15);

                // Crear el marcador seleccionado
                if (selectedMarker) {
                    selectedMarker.setMap(null);
                }
                selectedMarker = createSelectedMarker(position, edificio.nombre);

                // Almacenar el edificio seleccionado
                lastSelectedEdificio = edificio;

                // Mostrar todos los marcadores nuevamente
                actualizarMarcadoresVisibles(allEdificios);

                // Mostrar InfoBox
                actualizarContenidoInfoBox(edificio);
                mostrarInfoBox();
            });

            suggestionsContainer.appendChild(suggestion);
        });
    }

    //Crea el marcador seleccionado
    function createSelectedMarker(position, title) {
        // Eliminar el marcador azul si existe
        if (selectedMarker) {
            selectedMarker.setMap(null);
        }

        // Crear un nuevo marcador rojo para el seleccionado
        selectedMarker = new google.maps.Marker({
            position: position,
            map: map,
            icon: {
                path: 'M15,0 C9,0 4,5 4,11 C4,17 15,26 15,26 S26,17 26,11 C26,5 21,0 15,0 Z',
                fillColor: '#FF0000', // Rojo
                fillOpacity: 1,
                strokeWeight: 1,
                strokeColor: '#DDDDDD',
                scale: 1,
                anchor: new google.maps.Point(15, 26),
            },
            title: title,
            visible: true,
            zIndex: google.maps.Marker.MAX_ZINDEX + 3
        });


        // Mantener el marcador visible durante zooms
        selectedMarker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);

        google.maps.event.addListener(map, 'zoom_changed', function () {
            if (selectedMarker) {
                selectedMarker.setVisible(true);
            }
        });

        return selectedMarker;
    }

    document.getElementById('searchInput').addEventListener('input', function (e) {
        const query = e.target.value;
        if (query.length > 0) {
            const edificiosFiltrados = filtrarEdificios(query);
            actualizarMarcadoresVisibles(edificiosFiltrados);
            mostrarSugerencias(edificiosFiltrados);

            // Remover el marcador azul seleccionado cuando se empieza a escribir
            if (selectedMarker) {
                selectedMarker.setMap(null);
                selectedMarker = null;
            }
        } else {
            // Mostrar todos los edificios y restaurar visibilidad
            actualizarMarcadoresVisibles(allEdificios);
            document.getElementById('searchSuggestions').innerHTML = '';

            // Restaurar el marcador azul del último edificio seleccionado
            if (lastSelectedEdificio) {
                const position = new google.maps.LatLng(parseFloat(lastSelectedEdificio.latitud), parseFloat(lastSelectedEdificio.longitud));
                selectedMarker = createSelectedMarker(position, lastSelectedEdificio.nombre);
            }
        }
    });


    window.addEventListener('resize', () => {
        isMobile = window.innerWidth < 768;
    });

    document.getElementById('close-info-box').addEventListener('click', ocultarInfoBox);

    const imageCache = {};

    function actualizarContenidoInfoBox(edificio) {
        const imgElement = document.getElementById('info-img');

        // Mostrar placeholder temporal inmediatamente
        imgElement.src = 'https://via.placeholder.com/150?text=Cargando...';
        imgElement.alt = `Imagen de ${edificio.nombre}`;

        // Verificar si la imagen ya está en caché
        if (imageCache[edificio.imagen_url]) {
            imgElement.src = imageCache[edificio.imagen_url]; // Usar la imagen desde la caché
            imgElement.alt = `Imagen de ${edificio.nombre}`;
        } else {
            // Crear una nueva instancia de Image para cargar la imagen en segundo plano
            const tempImage = new Image();
            tempImage.src = edificio.imagen_url || 'https://via.placeholder.com/150?text=%3F';

            tempImage.onload = () => {
                imgElement.src = tempImage.src; // Actualizar la imagen al completarse la carga
                imageCache[edificio.imagen_url] = tempImage.src; // Guardar en la caché
            };

            tempImage.onerror = () => {
                imgElement.src = 'https://via.placeholder.com/150?text=%3F'; // Imagen por defecto en caso de error
                imgElement.alt = 'Imagen no disponible';
            };
        }

        document.getElementById('info-nombre').textContent = edificio.nombre;
        document.getElementById('info-direccion').textContent = edificio.direccion;
        document.getElementById('info-horario').textContent = `${edificio.horario_inicio} a ${edificio.horario_final}`;

        const sitioWebElement = document.getElementById('info-sitioweb');
        if (edificio.sitioweb) {
            sitioWebElement.href = edificio.sitioweb; // Asignar el enlace si existe
            sitioWebElement.textContent = "Enlace Página Web"; // Texto fijo para el enlace
            sitioWebElement.style.pointerEvents = "auto"; // Habilitar clics
            sitioWebElement.style.textDecoration = "underline"; // Opcional: añadir subrayado
        } else {
            sitioWebElement.removeAttribute("href"); // Eliminar el atributo href
            sitioWebElement.textContent = "Sin sitio web"; // Mostrar texto plano
            sitioWebElement.style.pointerEvents = "none"; // Deshabilitar clics
            sitioWebElement.style.textDecoration = "none"; // Opcional: eliminar subrayado
        }

        const accesibilidadList = document.getElementById('info-accesibilidad');
        accesibilidadList.innerHTML = '';

        if (edificio.accesibilidad) { // Verifica si accesibilidad tiene valor
            edificio.accesibilidad.split(',').forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.trim();
                accesibilidadList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'Sin información de accesibilidad';
            accesibilidadList.appendChild(li);
        }

        const actionButton = document.querySelector('.action-button');
        actionButton.innerHTML = '<i class="fas fa-directions"></i><span>Cómo llegar</span>';
        actionButton.onclick = () => {
            ocultarInfoBox(); // Cerrar InfoBox antes de abrir el modal
            mostrarRutaEnModal(edificio);
        };
    }

    //Abre el Modal de informacion
    function mostrarInfoBox() {
        const infoBox = document.getElementById('infoBox');
        if (infoBox) {
            infoBox.classList.add('active');
        }
        document.body.style.overflow = 'hidden';
    }

    //Cierra el modal de informacion
    function ocultarInfoBox() {
        const infoBox = document.getElementById('infoBox');
        if (infoBox) {
            infoBox.classList.remove('active');
        }
        document.body.style.overflow = '';

        // Limpiar la búsqueda
        document.getElementById('searchInput').value = '';
        const suggestionsContainer = document.getElementById('searchSuggestions');
        suggestionsContainer.innerHTML = '';

        // Restaurar el marcador seleccionado
        if (selectedMarker) {
            selectedMarker.setMap(null);
            selectedMarker = null;
        }

        // Restablecer cualquier grupo de marcadores seleccionado
        if (selectedMarkerGroup) {
            restoreMarkerGroup(selectedMarkerGroup);
            selectedMarkerGroup = null;
        }

        // Restaurar la visibilidad de la etiqueta si está oculta
        if (selectedLabelOverlay) {
            selectedLabelOverlay.isHidden = false;
            selectedLabelOverlay.draw();
            selectedLabelOverlay = null;
        }
    }

    //Funciones de modificar y eliminar de los marcadores
    function configurarListenersInfoBox(edificio) {
        // Remueve los event listeners previos (si existieran)
        const deleteButton = document.getElementById("delete-marker");
        if (deleteButton) {
            // Añadir el listener solo si el botón existe
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('¿Estás seguro de que quieres eliminar este edificio?')) {
                    eliminarEdificio(edificio.id_edificios);
                    ocultarInfoBox();
                }
            });
        }

        const editButton = document.getElementById("edit-marker");
        if (editButton) {
            // Añadir el listener solo si el botón existe
            editButton.addEventListener('click', (e) => {
                e.stopPropagation();
                abrirModal('editar', edificio);
            });
        }
    }


    //Funcion de eliminar los marcadores
    function eliminarEdificio(id) {
        fetch(`/delete_edificio/${id}`, {
            method: 'DELETE',
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert("Edificio eliminado exitosamente");
                    location.reload(); // Recargar para actualizar el mapa
                } else {
                    alert("Error al eliminar el edificio");
                }
            })
            .catch(error => console.error('Error:', error));
    }



    /*---------------------------------------------------------------------------------------------------------*/

    /*------------------------------------Funcion GPS + Boton centrador------------------------------------------*/

    let userLocationAccuracyCircle; // Variable global para el círculo de precisión
    let userLocationMarker;
    let isCentered = false; // Variable para rastrear si el mapa está centrado en la ubicación del usuario

    // Función para centrar el mapa en la ubicación del usuario
    function centerMapOnUserLocation() {
        if (userLocationMarker) {
            // Obtener la posición actual del mapa
            const userPosition = userLocationMarker.getPosition();
            map.panTo(userPosition);
            smoothZoom(map, 18, 900); // Ajusta el segundo parámetro al nivel de zoom deseado
            isCentered = true;
            document.getElementById('centerButton').classList.add('active');
        }
    }

    // Función para realizar un zoom suave
    function smoothZoom(map, targetZoom, duration) {
        const currentZoom = map.getZoom();
        const step = (targetZoom > currentZoom ? 1 : -1); // Determinar si estamos haciendo zoom in o zoom out
        let zoom = currentZoom;

        const interval = setInterval(() => {
            if ((step > 0 && zoom >= targetZoom) || (step < 0 && zoom <= targetZoom)) {
                clearInterval(interval);
            } else {
                zoom += step;
                map.setZoom(zoom);
            }
        }, duration / Math.abs(targetZoom - currentZoom));
    }

    // Evento para el botón de centrar
    document.getElementById('centerButton').addEventListener('click', centerMapOnUserLocation);

    // Evento para detectar cuando el mapa se mueve
    map.addListener('center_changed', function () {
        if (isCentered) {
            isCentered = false;
            document.getElementById('centerButton').classList.remove('active');
        }
    });


    // Manejar errores de ubicación
    function handleLocationError(isPrecisionError = false) {
        const errorMessage = isPrecisionError
            ? "No se puede determinar la ubicación con precisión."
            : "No se pudo obtener la ubicación.";
        showLocationError(errorMessage);
    }

    // Mostrar el modal de error de ubicación
    function showLocationError(message) {
        const locationErrorModal = document.getElementById('locationError');
        const locationErrorMessage = document.getElementById('locationErrorMessage');
        const closeButton = document.getElementById('btnCerrarErrorUbicacion');

        if (locationErrorModal && locationErrorMessage) {
            locationErrorMessage.textContent = message;

            // Asociar el evento de clic al botón de cierre (si no está ya configurado)
            if (closeButton) {
                closeButton.removeEventListener('click', closeLocationError); // Evitar múltiples registros
                closeButton.addEventListener('click', closeLocationError);
            }

            // Mostrar el modal agregando la clase 'show'
            locationErrorModal.classList.add('show');

            // Configurar un temporizador para cerrar automáticamente después de 1 minuto
            clearTimeout(locationErrorModal.timer);
            locationErrorModal.timer = setTimeout(closeLocationError, 60000);
        }
    }
    // Maneja el ciere del modal de error
    function closeLocationError() {
        const locationErrorModal = document.getElementById('locationError');
        if (locationErrorModal) {
            locationErrorModal.classList.remove('show');
            clearTimeout(locationErrorModal.timer);
        }
    }

    // Verifica si la API de geolocalización está disponible en el navegador
    if (navigator.geolocation) {
        // Utiliza watchPosition para rastrear la ubicación del usuario en tiempo real
        navigator.geolocation.watchPosition(
            (position) => {
                // Obtiene la posición actual del usuario
                const pos = {
                    lat: position.coords.latitude, // Latitud de la ubicación
                    lng: position.coords.longitude, // Longitud de la ubicación
                };

                if (position.coords.accuracy > 500) {
                    // Si la precisión es baja, mostrar un error de precisión
                    handleLocationError(true);
                    return;
                }

                // Ocultar el error si se obtiene una ubicación válida
                closeLocationError();

                // Verifica si el marcador de la ubicación del usuario ya existe
                if (!userLocationMarker) {
                    // Si no existe, crea un nuevo marcador en el mapa para mostrar la ubicación del usuario
                    userLocationMarker = new google.maps.Marker({
                        position: pos, // Posición actual del usuario
                        map: map, // Mapa donde se coloca el marcador
                        title: "Tu ubicación actual", // Texto al pasar el cursor sobre el marcador
                        icon: {
                            // Personaliza el ícono del marcador
                            path: google.maps.SymbolPath.CIRCLE, // Forma de círculo
                            scale: 8, // Tamaño del círculo
                            fillColor: "#4285F4", // Color de relleno
                            fillOpacity: 1, // Opacidad del relleno
                            strokeColor: "white", // Color del borde
                            strokeWeight: 2, // Grosor del borde
                        },
                    });

                    // Crea un círculo alrededor de la ubicación del usuario que indica la precisión
                    userLocationAccuracyCircle = new google.maps.Circle({
                        strokeColor: "#4285F4", // Color del borde del círculo
                        strokeOpacity: 0.4, // Opacidad del borde
                        strokeWeight: 1, // Grosor del borde
                        fillColor: "#4285F4", // Color de relleno
                        fillOpacity: 0.1, // Opacidad del relleno
                        map: map, // Mapa donde se dibuja el círculo
                        center: pos, // Centro del círculo en la ubicación del usuario
                        radius: position.coords.accuracy, // Radio del círculo basado en la precisión
                    });

                    // No centra automáticamente el mapa aquí
                } else {
                    // Si el marcador ya existe, actualiza su posición
                    userLocationMarker.setPosition(pos); // Actualiza la posición del marcador
                    userLocationAccuracyCircle.setCenter(pos); // Actualiza el centro del círculo
                    userLocationAccuracyCircle.setRadius(position.coords.accuracy); // Actualiza el radio del círculo

                    // Si el mapa está centrado en el usuario, ajusta la posición del mapa
                    if (isCentered) {
                        map.panTo(pos); // Desplaza el mapa hacia la nueva posición
                    }
                }
            },
            // Función en caso de error al obtener la ubicación
            () => {
                handleLocationError(true, map.getCenter(), map);
            },
            {
                enableHighAccuracy: true, // Solicita alta precisión para la ubicación
                maximumAge: 0, // No usa ubicaciones almacenadas en caché
                timeout: 10000, // Tiempo máximo de espera para obtener la ubicación
            }
        );
    } else {
        // Si la API de geolocalización no está disponible, maneja el error
        handleLocationError(false, map.getCenter(), map);
    }


    /*--------------------------------------------------------------------------------------------------------------- */


    /*--------------------------------------arreglo sobre Street view-----------------------------------------------*/

    const panorama = map.getStreetView();

    panorama.addListener("visible_changed", () => {
        if (panorama.getVisible()) {
            document.querySelectorAll(".gm-style img").forEach((img) => {
                img.style.display = "none";
            });
        } else {
            document.querySelectorAll(".gm-style img").forEach((img) => {
                img.style.display = "block";
            });
        }
    });


    /*--------------------------------------------------------------------------------------------------------------- */



    /*------------------------------- Modal de edicion --------------------------------------*/



    let datos_accesibilidad = []; // Variable global para almacenar los datos
     
    // Limpiar campos manuales (cuando cambias a Places)
    function limpiarCamposManual() {
        document.getElementById('nombre').value = '';
        document.getElementById('direccion').value = '';
        document.getElementById('latitud').value = '';
        document.getElementById('longitud').value = '';
        document.getElementById('imagen').value = '';
        document.getElementById('sitioWeb').value = '';
    }
    // Limpiar campos de Places (cuando cambias a manual)
    function limpiarCamposPlaces() {
        document.getElementById('placesSearch').value = ''; // Limpiar el campo de búsqueda
        document.getElementById('nombre').value = '';
        document.getElementById('direccion').value = '';
        document.getElementById('latitud').value = '';
        document.getElementById('longitud').value = '';
        document.getElementById('imagen').value = '';
        document.getElementById('sitioWeb').value = '';
    }

    // Función para abrir el modal
    async function abrirModal(tipo, datos = null) {
        const modal = document.getElementById('edificioModal');
        const titulo = document.getElementById('modalTitulo');
        const form = document.getElementById('edificioForm');
        const submitBtn = document.getElementById('submitBtn');
        const toggleModeContainer = document.getElementById('toggleModeContainer');
        const searchContainer = document.getElementById('searchContainer');
        const manualFields = document.getElementById('fieldsContainer');
        const manualModeBtn = document.getElementById('manualModeBtn');
        const placesSearch = document.getElementById('placesSearch');

        // Reiniciar el formulario
        form.reset();

        // Asegurarse de que el campo 'placesSearch' tenga el atributo 'required' cuando estamos en el modo Places
        if (placesSearch) {
            // Solo agregamos el required si estamos en modo agregar
            if (tipo !== 'editar') {
                placesSearch.setAttribute('required', 'required');
            } else {
                placesSearch.removeAttribute('required');
            }
        }

        if (tipo === 'editar' && datos) {
            // Cambiar título y texto del botón
            titulo.textContent = 'Editar Edificio';
            submitBtn.textContent = 'Guardar Cambios';

            // Ocultar el botón para cambiar a modo manual y el campo de búsqueda
            toggleModeContainer.style.display = 'none';
            searchContainer.style.display = 'none';
            manualFields.style.display = 'block';

            // Rellenar el formulario con los datos existentes
            document.getElementById('nombre').value = datos.nombre || '';
            document.getElementById('tipoEdificio').value = datos.tipo_edificio || '';
            document.getElementById('direccion').value = datos.direccion || '';
            document.getElementById('sitioWeb').value = datos.sitioweb || '';
            document.getElementById('imagen').value = datos.imagen_url || '';
            document.getElementById('latitud').value = datos.latitud || '';
            document.getElementById('longitud').value = datos.longitud || '';
            document.getElementById('horarioInicio').value = datos.horario_inicio || '';
            document.getElementById('horarioFin').value = datos.horario_final || '';

            // Configurar accesibilidad
            const accesibilidades = datos.accesibilidad
                ? datos.accesibilidad.split(',').map(item => item.trim()) // Dividir por coma y limpiar espacios
                : [];

            // Cargar la accesibilidad

            cargarAccesibilidad('accesibilidadContainer', accesibilidades);

            // Configurar el envío del formulario
            form.onsubmit = function (e) {
                e.preventDefault();
                guardarCambios(datos.id_edificios);
            };
        } else {
            // Cambiar título y texto del botón
            titulo.textContent = 'Agregar Nuevo Edificio';
            submitBtn.textContent = 'Agregar Edificio';

            // Mostrar el botón para cambiar a modo manual y el campo de búsqueda
            toggleModeContainer.style.display = 'block';
            searchContainer.style.display = 'block';
            manualFields.style.display = 'none';

            // Configurar el texto inicial del botón de cambio
            manualModeBtn.textContent = 'Agregar Manualmente';

            // Configurar accesibilidad para agregar

            cargarAccesibilidad('accesibilidadContainer', []); // Pasamos array vacío si estamos agregando un nuevo edificio

            // Configurar el envío del formulario para agregar
            form.onsubmit = function (e) {
                e.preventDefault();
                agregarEdificio();
            };

            // Configurar el evento del botón para alternar entre modos
            manualModeBtn.onclick = function () {
                if (manualFields.style.display === 'none' || manualFields.style.display === '') {
                    manualFields.style.display = 'block';
                    searchContainer.style.display = 'none';
                    manualModeBtn.textContent = 'Agregar con Places';

                    // Quitar el atributo 'required' al campo de Places cuando estamos en modo manual
                    if (placesSearch) {
                        placesSearch.removeAttribute('required');
                        limpiarCamposPlaces()
                    }
                } else {
                    manualFields.style.display = 'none';
                    searchContainer.style.display = 'block';
                    manualModeBtn.textContent = 'Agregar Manualmente';

                    // Asegurarnos de que el campo 'placesSearch' tenga el atributo 'required' cuando estamos en el modo Places
                    if (placesSearch) {
                        placesSearch.setAttribute('required', 'required');
                        limpiarCamposManual()
                    }
                }
            };
        }

        // Mostrar el modal
        modal.style.display = 'block';

        // Manejar el cierre del modal
        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.onclick = function () {
                modal.style.display = 'none';
            };
        }
    };


    // Vincular el botón para abrir el modal de agregar
    const agregarBtn = document.getElementById('agregar-marcador');
    if (agregarBtn) {
        agregarBtn.addEventListener('click', function () {
            abrirModal('agregar');
        });
    }

    // Función para inicializar Google Places Autocomplete
    function inicializarAutocomplete() {
        const placesSearch = document.getElementById('placesSearch');
        if (!placesSearch) return;

        // Define los límites de la Región del Maule
        const mauleBounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(-36.4839, -72.7918), // Suroeste
            new google.maps.LatLng(-34.8222, -70.7214)  // Noreste
        );

        // Opciones de Autocomplete
        const autocompleteOptions = {
            bounds: mauleBounds,           // Limitar a los límites de la Región del Maule
            strictBounds: true,            // Restringir los resultados dentro de los límites
            types: ['establishment'],      // Solo mostrar establecimientos (ej. edificios)
            componentRestrictions: { country: 'cl' } // Restringir a Chile
        };

        const autocomplete = new google.maps.places.Autocomplete(placesSearch, autocompleteOptions);

        // Evento cuando se selecciona un lugar
        autocomplete.addListener('place_changed', function () {
            const place = autocomplete.getPlace();
            if (!place.geometry) {
                alert('No se encontró información de ubicación.');
                return;
            }

            // Completar los campos con la información del lugar seleccionado
            document.getElementById('nombre').value = place.name || '';
            document.getElementById('direccion').value = place.formatted_address || '';
            document.getElementById('latitud').value = place.geometry.location.lat();
            document.getElementById('longitud').value = place.geometry.location.lng();
            document.getElementById('sitioWeb').value = place.website || '';
        });

    }

    // Función para cargar dinámicamente los tipos de accesibilidad
    async function cargarAccesibilidad(containerId, seleccionados = []) {
        try {
            const container = document.getElementById(containerId);
            container.innerHTML = ''; // Limpiar el contenido previo

            datos_accesibilidad.forEach(item => {
                const itemId = item.id_tipos; // Usamos 'id' como valor, ya que es el string que seleccionamos

                if (itemId !== undefined && item.nombre) {
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = itemId; // Usamos 'nombre' como valor
                    checkbox.id = `${itemId}`;
                    checkbox.name = 'accesibilidad[]'; // Notación de array para múltiples selecciones

                    // Verificar si el ítem está en el array de seleccionados
                    checkbox.checked = seleccionados.includes(item.nombre);

                    const label = document.createElement('label');
                    label.setAttribute('for', checkbox.id);
                    label.textContent = item.nombre;

                    const div = document.createElement('div');
                    div.classList.add('accesibilidad-item');
                    div.appendChild(checkbox);
                    div.appendChild(label);
                    container.appendChild(div);
                } else {
                    console.warn('Elemento de accesibilidad no válido:', item);
                }
            });
        } catch (error) {
            console.error(`Error al cargar accesibilidad: ${error.message}`);
        }
    }

    // Función para obtener accesibilidad desde el servidor
    function obtenerAccesibilidad() {
        fetch('/get_acessibilidad', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error en la respuesta del servidor: ${response.statusText}`);
            }
            return response.json(); // Convertir la respuesta en JSON
        })
        .then(datos => {
            datos_accesibilidad = Array.isArray(datos) ? datos : []; // Asegurarse de que sea un array
            console.log("Datos de accesibilidad obtenidos:", datos_accesibilidad);
        })
        .catch(error => {
            console.error(`Error al obtener accesibilidad: ${error.message}`);
            datos_accesibilidad = []; // Establecer como un array vacío en caso de error
        });
    }


    obtenerAccesibilidad(); // Llama automáticamente cuando cargue la página

    // Función para agregar un edificio
    function agregarEdificio() {
        const form = document.getElementById('edificioForm');
        const formData = new FormData(form);

        const edificio = {
            nombre: formData.get('nombre'),
            tipo_edificio: formData.get('tipoEdificio'), // ID del tipo de edificio
            direccion: formData.get('direccion'),
            imagen_url: formData.get('imagen'),
            horario_inicio: formData.get('horarioInicio'),
            horario_final: formData.get('horarioFin'),
            sitioweb: formData.get('sitioWeb'),
            latitud: parseFloat(formData.get('latitud')),
            longitud: parseFloat(formData.get('longitud')),
            tipo_accesibilidad: Array.from(formData.getAll('accesibilidad[]'))
        };

        fetch('/add_edificio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(edificio),
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Edificio agregado exitosamente');
                    document.getElementById('edificioModal').style.display = 'none';
                    location.reload();
                } else {
                    alert('Error: ' + (data.error || 'No se pudo agregar el edificio'));
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error al agregar el edificio');
            });
    }

    // Función para guardar cambios al editar
    function guardarCambios(id) {
        const form = document.getElementById('edificioForm');
        const formData = new FormData(form);

        const edificioActualizado = {
            nombre: formData.get('nombre'),
            tipo_edificio: formData.get('tipoEdificio'), // ID del tipo de edificio
            direccion: formData.get('direccion'),
            imagen_url: formData.get('imagen'),
            horario_inicio: formData.get('horarioInicio'),
            horario_final: formData.get('horarioFin'),
            sitioweb: formData.get('sitioWeb'),
            latitud: parseFloat(formData.get('latitud')),
            longitud: parseFloat(formData.get('longitud')),
            tipo_accesibilidad: Array.from(formData.getAll('accesibilidad[]'))
        };


        fetch(`/edit_edificio/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(edificioActualizado),
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Edificio actualizado con éxito');
                    document.getElementById('edificioModal').style.display = 'none';
                    location.reload();
                } else {
                    alert('Error: ' + (data.error || 'No se pudo actualizar el edificio'));
                }
            })
            .catch(error => {
                console.error('Error al actualizar:', error.message);
                alert(`Error al actualizar el edificio: ${error.message}`);
            });
    }

    // Inicializar Google Places Autocomplete
    inicializarAutocomplete();





    /*--------------------------------------------------------------------------------------------------------------- */



    /*-------------------------------funcion de ruta------------------------------ */


    // Variables para servicios de rutas
    let directionsService = new google.maps.DirectionsService();
    let directionsRenderer = new google.maps.DirectionsRenderer();

    // Configurar el mapa para renderizar direcciones
    directionsRenderer.setMap(map);

    // Añadir esto dentro de la función initMap o donde sea apropiado
    let infoBoxEnabled = true;
    let currentRouteMode = 'DRIVING';

    function mostrarRutaEnModal(edificio) {
        if (!userLocationMarker) {
            alert("No se pudo obtener tu ubicación actual.");
            return;
        }

        const origin = userLocationMarker.getPosition();
        const destination = new google.maps.LatLng(parseFloat(edificio.latitud), parseFloat(edificio.longitud));

        const routeModal = document.getElementById('routeModal');
        const walkingModeButton = document.getElementById('walkingMode');
        const drivingModeButton = document.getElementById('drivingMode');
        const moreInfoButton = document.getElementById('moreInfoButton');

        walkingModeButton.addEventListener('click', () => setRouteMode('WALKING'));
        drivingModeButton.addEventListener('click', () => setRouteMode('DRIVING'));
        moreInfoButton.addEventListener('click', () => abrirEnGoogleMaps(origin, destination));

        calcularRuta(origin, destination, currentRouteMode);

        routeModal.style.display = 'block';

        // Deshabilitar la apertura del infoBox
        infoBoxEnabled = false;

        // Ocultar el infoBox si está abierto
        const infoBox = document.getElementById('infoBox');
        if (infoBox.classList.contains('active')) {
            ocultarInfoBox();
        }
    }

    function setRouteMode(mode) {
        currentRouteMode = mode;
        document.querySelectorAll('.route-mode-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(mode.toLowerCase() + 'Mode').classList.add('active');
        calcularRuta(userLocationMarker.getPosition(), directionsRenderer.getDirections().request.destination, mode);
    }

    function calcularRuta(origin, destination, travelMode) {
        const request = {
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode[travelMode],
            provideRouteAlternatives: false,
            unitSystem: google.maps.UnitSystem.METRIC,
        };

        directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                directionsRenderer.setMap(map);
                directionsRenderer.setDirections(result);

                directionsRenderer.setOptions({
                    markerOptions: {
                        visible: false // Ocultar marcadores de A y B
                    }
                });

                const route = result.routes[0].legs[0];
                const distance = route.distance.text;
                const time = route.duration.text;

                // Actualizar distancia y tiempo en PC
                document.getElementById('routeDistance').textContent = `Distancia: ${distance}`;
                document.getElementById('routeTime').textContent = `Tiempo estimado: ${time}`;

                // Actualizar distancia y tiempo en móviles
                document.getElementById('routeDistanceMobile').textContent = `Distancia: ${distance}`;
                document.getElementById('routeTimeMobile').textContent = `Tiempo estimado: ${time}`;

                mostrarDetallesRuta(result);
            } else {
                alert("No se pudo calcular la ruta: " + status);
            }
        });
    }

    function mostrarDetallesRuta(result) {
        const route = result.routes[0];
        const routeDetailsElement = document.getElementById('routeDetails');
        let detallesHTML = `
        <p><strong>Distancia:</strong> ${route.legs[0].distance.text}</p>
        <p><strong>Tiempo estimado:</strong> ${route.legs[0].duration.text}</p>
        <ol>
    `;
        route.legs[0].steps.forEach(step => {
            detallesHTML += `<li>${step.instructions}</li>`;
        });
        detallesHTML += '</ol>';
        routeDetailsElement.innerHTML = detallesHTML;
    }

    function abrirEnGoogleMaps(origin, destination) {
        const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat()},${origin.lng()}&destination=${destination.lat()},${destination.lng()}&travelmode=${currentRouteMode.toLowerCase()}`;
        window.open(url, '_blank');
    }

    function mostrarInfoBox() {
        if (!infoBoxEnabled) {
            return; // No abrir el infoBox si está deshabilitado
        }

        const infoBox = document.getElementById('infoBox');
        if (infoBox) {
            infoBox.classList.add('active');
        }
        document.body.style.overflow = 'hidden';
    }


    function cerrarModalRuta() {
        const routeModal = document.getElementById('routeModal');
        routeModal.style.display = 'none';

        // Eliminar la ruta del mapa
        directionsRenderer.setMap(null);

        // Habilitar la apertura del infoBox
        infoBoxEnabled = true;
    }

    // Asegurarse de que este evento esté correctamente asociado
    document.querySelector('.route-modal-close').addEventListener('click', cerrarModalRuta);

    document.addEventListener('DOMContentLoaded', function () {
        const routeModal = document.getElementById('routeModal');
        const walkingMode = document.getElementById('walkingMode');
        const drivingMode = document.getElementById('drivingMode');
        const closeButton = document.querySelector('.route-modal-close');

        function setActiveMode(button) {
            walkingMode.classList.remove('active');
            drivingMode.classList.remove('active');
            button.classList.add('active');
        }

        walkingMode.addEventListener('click', function () {
            setActiveMode(this);
        });

        drivingMode.addEventListener('click', function () {
            setActiveMode(this);
        });

        closeButton.addEventListener('click', function () {
            routeModal.style.display = 'none';
        });
    });


    /*---------------------------------------------------------------------------------------------*/


    /*-----------------------------Modal para agregar lineas accesibilidad--------------------------*/
    const agregarLineBtn = document.getElementById("agregar-line");
    const modal = document.getElementById("accessibilityModal");
    const closeModalBtn = document.getElementById("closeModal");
    const form = document.getElementById("accessibilityForm");
    
    
    // Asegurarse de que el modal esté oculto al cargar la página
    modal.style.display = "none";
    
    // Abrir el modal cuando se presiona el botón "Agregar Line"
    agregarLineBtn.addEventListener("click", abrirModalAgregar);

    
    closeModalBtn.addEventListener("click", function () {
        modal.style.display = "none";
        document.body.style.overflow = "auto"; // Restore scroll
    });

    
    let DataLineas = [];
    let AlltrueboolAccesibilidad = [];
    let allLines = []; // Variable para almacenar las líneas creadas en el mapa
    
    // Nivel de zoom mínimo para mostrar las líneas
    const ZOOM_LINES = 18;
    
    // Llamada a la función para obtener las líneas al cargar la página
    fetchLineas();
    
    // Función para obtener las líneas desde el servidor
    function fetchLineas() {
        fetch('/get_lineas')
            .then(response => response.json())
            .then(data => {
                DataLineas = data.lineas; // Guardar datos de líneas
                AlltrueboolAccesibilidad = data.tipos_accesibilidad; // Guardar tipos de accesibilidad
    
                // Cargar dinámicamente las opciones de accesibilidad en el formulario
                cargaOpcionesAccesibilidad();
    
                // Agregar las líneas al mapa después de obtener los datos
                cargarLineasEnMapa(DataLineas);
                
            })
            .catch(error => {
                console.error('Error al obtener los datos:', error);
            });
    }


    // Función para cargar las líneas en el mapa
    function cargarLineasEnMapa(dataLineas) {
        // Limpiar las líneas existentes en el mapa
        allLines.forEach(line => line.setMap(null));
        allLines = [];

        // Retrasar la ejecución de la carga de las líneas
        setTimeout(() => {
            // Crear y agregar nuevas líneas al mapa
            dataLineas.forEach(linea => {
                const {id_accesibilidad_mapa, latitud_inicio, longitud_inicio, latitud_final, longitud_final, color_line, nombre, descripcion } = linea;
                agregarLineaAlMapa(id_accesibilidad_mapa,latitud_inicio, longitud_inicio, latitud_final, longitud_final, color_line, nombre, descripcion);
            });

            // Configurar el evento de cambio de zoom para manejar la visibilidad
            google.maps.event.addListener(map, 'zoom_changed', function () {
                const zoom = map.getZoom();

                // Mostrar u ocultar líneas según el nivel de zoom
                allLines.forEach(line => {
                    line.setVisible(zoom >= ZOOM_LINES);
                });
            });
        }, 200);

    }

    
    // Función para agregar la línea al mapa
    function agregarLineaAlMapa(id_accesibilidad_mapa, latitud_inicio, longitud_inicio, latitud_final, longitud_final, color, nombre, descripcion) {
        const latInicio = parseFloat(latitud_inicio);
        const lonInicio = parseFloat(longitud_inicio);
        const latFinal = parseFloat(latitud_final);
        const lonFinal = parseFloat(longitud_final);
    
        // Ruta de la imagen basada en el nombre, codificando el nombre
        const imagenUrl = `/static/images/line/${encodeURIComponent(nombre)}.png`;
    
        // Crear la línea con un grosor fijo
        const line = new google.maps.Polyline({
            path: [
                { lat: latInicio, lng: lonInicio },
                { lat: latFinal, lng: lonFinal }
            ],
            geodesic: true,
            strokeColor: color,
            strokeOpacity: 1.0,
            strokeWeight: 16, // Grosor fijo
            visible: map.getZoom() >= ZOOM_LINES // Determinar visibilidad inicial
        });
    
        // Crear el InfoWindow con la descripción
        const infoWindow = new google.maps.InfoWindow({
            content: `<div style="max-width: 300px;">
                        <h3>${nombre}</h3>
                        <p>${descripcion}</p>
                        <button class="btn-modificar" data-id="${id_accesibilidad_mapa}">Modificar</button>
                        <button class="btn-eliminar" data-id="${id_accesibilidad_mapa}">Eliminar</button>
                      </div>`
        });
    
        // Agregar evento de clic a la línea para mostrar el InfoWindow
        line.addListener("click", (event) => {
            infoWindow.setPosition(event.latLng);
            infoWindow.open(map);
        });
    
        // Agregar la línea al mapa
        line.setMap(map);
    
        // Calcular puntos intermedios y agregar marcadores con la imagen
        const puntos = 5; // Número de imágenes a colocar
        const markers = []; // Array para almacenar los marcadores
    
        for (let i = 0; i < puntos; i++) { // Cambiamos de i <= puntos a i < puntos para evitar el último punto
            const ajuste = 0.95; // Factor para que el último punto no esté en el borde (por ejemplo, 95% del trayecto)
            const proporcion = i / (puntos - 1) * ajuste; // Ajustamos la proporción
            const puntoIntermedio = google.maps.geometry.spherical.interpolate(
                new google.maps.LatLng(latInicio, lonInicio),
                new google.maps.LatLng(latFinal, lonFinal),
                proporcion
            );
    
            // Crear marcador en el punto intermedio con la imagen
            const marker = new google.maps.Marker({
                position: puntoIntermedio,
                map: map,
                icon: {
                    url: imagenUrl, // Ruta de la imagen
                    scaledSize: new google.maps.Size(16, 16), // Tamaño más pequeño para las imágenes
                    anchor: new google.maps.Point(8, 4) // Anclaje centrado
                },
                visible: map.getZoom() >= ZOOM_LINES // Determinar visibilidad inicial del marcador
            });
    
            // Agregar evento de clic al marcador
            marker.addListener("click", () => {
                infoWindow.setPosition(marker.getPosition());
                infoWindow.open(map);
            });
    
            markers.push(marker); // Agregar el marcador al array
        }
    
        // Almacenar la línea en el array
        allLines.push(line);
    
        // Escuchar el evento zoom_changed del mapa
        google.maps.event.addListener(map, "zoom_changed", () => {
            const zoomActual = map.getZoom();
            const visible = zoomActual >= ZOOM_LINES;
    
            // Actualizar la visibilidad de la línea
            line.setVisible(visible);
    
            // Actualizar la visibilidad de los marcadores
            markers.forEach(marker => marker.setVisible(visible));
        });
    }

    document.addEventListener("click", (event) => {
        if (event.target.classList.contains("btn-modificar")) {
            const id = event.target.dataset.id;
            abrirModalEdicion(id);
        }
    
        if (event.target.classList.contains("btn-eliminar")) {
            const id = event.target.dataset.id;
            eliminarLinea(id);
        }
    });
    
    
    // Función para cargar las opciones de accesibilidad en el formulario
    function cargaOpcionesAccesibilidad() {
        const accesibilidadSelect = document.getElementById("accesibilidad");
    
        // Limpiar opciones anteriores
        accesibilidadSelect.innerHTML = '<option value="" disabled selected>Seleccione una opción</option>';
    
        // Cargar las nuevas opciones
        AlltrueboolAccesibilidad.forEach(accesibilidad => {
            const option = document.createElement("option");
            option.value = accesibilidad.id_tipos; // Asumimos que 'id_tipos' es el identificador
            option.textContent = accesibilidad.nombre; // Asumimos que 'nombre' es el texto de la opción
            accesibilidadSelect.appendChild(option);
        });
    }


    // Enviar los datos del formulario cuando se haga submit
    form.addEventListener("submit", function (e) {
        e.preventDefault();
    
        // Obtener los datos del formulario
        const marcaAccesibilidad = document.getElementById("accesibilidad").value;
        const latitud_inicio = document.getElementById("latitud_inicio").value;
        const longitud_inicio = document.getElementById("longitud_inicio").value;
        const latitud_final = document.getElementById("latitud_final").value;
        const longitud_final = document.getElementById("longitud_final").value;
        const descripcion = document.getElementById("descripcion").value;
        const color = document.getElementById("color").value;
    
        // Determinar si es agregar o editar
        const id = document.querySelector(".accessibility-form__submit-btn").dataset.id;
        const url = id ? `/edit_marca_accesibilidad/${id}` : '/add_marca_accesibilidad';
        const method = id ? "PUT" : "POST";
    
        fetch(url, {
            method: method,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                descripcion: descripcion,
                color_line: color,
                latitud_inicio: latitud_inicio,
                longitud_inicio: longitud_inicio,
                latitud_final: latitud_final,
                longitud_final: longitud_final,
                tipo_accesibilidad_id: marcaAccesibilidad,
            }),
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert(id ? "Línea actualizada con éxito" : "Línea agregada con éxito");
                    modal.style.display = "none";
                    location.reload();
                } else {
                    console.error("Error:", data.error);
                }
            })
            .catch(error => {
                console.error("Error al enviar los datos:", error);
            });
    });

    function abrirModalEdicion(id) {
        // Obtener datos de la línea desde el servidor
        fetch(`/get_linea/${id}`)
            .then(response => response.json())
            .then(data => {
                // Rellenar el formulario con los datos obtenidos
                document.getElementById("accesibilidad").value = data.tipo_accesibilidad_id;
                document.getElementById("latitud_inicio").value = data.latitud_inicio;
                document.getElementById("longitud_inicio").value = data.longitud_inicio;
                document.getElementById("latitud_final").value = data.latitud_final;
                document.getElementById("longitud_final").value = data.longitud_final;
                document.getElementById("color").value = data.color_line;
                document.getElementById("descripcion").value = data.descripcion;
    
                // Cambiar el título del modal
                document.querySelector(".accessibility-modal__title").textContent = "Modificar Línea de Accesibilidad";
    
                // Cambiar el texto del botón de enviar
                const submitButton = document.querySelector(".accessibility-form__submit-btn");
                submitButton.textContent = "Modificar Línea";
                submitButton.dataset.id = id; // Guardar el ID en el botón para identificar la edición
    
                // Mostrar el modal
                modal.style.display = "flex";
                document.body.style.overflow = "hidden";
            })
            .catch(error => {
                console.error("Error al obtener los datos de la línea:", error);
            });
    }
    

    function abrirModalAgregar() {
        // Limpiar el formulario
        form.reset();
    
        // Cambiar el título del modal
        document.querySelector(".accessibility-modal__title").textContent = "Agregar Línea de Accesibilidad";
    
        // Cambiar el texto del botón de enviar
        const submitButton = document.querySelector(".accessibility-form__submit-btn");
        submitButton.textContent = "Agregar Línea";
        delete submitButton.dataset.id; // Eliminar el ID del botón si existe
    
        // Mostrar el modal
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }
    
        
    


    
    function eliminarLinea(id) {
        if (!confirm("¿Estás seguro de que deseas eliminar esta línea?")) return;
    
        fetch(`/delete_marca_accesibilidad/${id}`, {
            method: "DELETE",
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert("Línea eliminada con éxito");
                    location.reload();
                } else {
                    console.error("Error al eliminar la línea:", data.error);
                }
            })
            .catch(error => {
                console.error("Error al eliminar la línea:", error);
            });
    }
    


/*---------------------------------------------------------------------------------------------*/




    



}




