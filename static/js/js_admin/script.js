let selectedMarker = null;
let infoBoxVisible = false;
let isMobile = window.innerWidth < 768;
let allMarkers = [];
let allEdificios = [];
let markerGroups = new Map();
let selectedMarkerGroup = null;
let selectedLabelOverlay = null;
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
                    url: `/static/images/marker/${edificio.tipo_edificio.toLowerCase()}.png`,  // Ruta de la imagen PNG
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

    //actualiza el contendo del modal de infomacion
    function actualizarContenidoInfoBox(edificio) {
        const imgElement = document.getElementById('info-img');
        imgElement.src = edificio.imagen_url || 'https://via.placeholder.com/150?text=%3F'; // Imagen de reemplazo por defecto
        imgElement.alt = `Imagen de ${edificio.nombre}`;
    
        // Si la imagen falla al cargar, muestra la imagen de reemplazo
        imgElement.onerror = () => {
            imgElement.src = 'https://via.placeholder.com/150?text=%3F';
        };
    
        document.getElementById('info-nombre').textContent = edificio.nombre;
        document.getElementById('info-direccion').textContent = edificio.direccion;
        document.getElementById('info-horario').textContent = `${edificio.horario_inicio} a ${edificio.horario_final}`;
    
        const sitioWebElement = document.getElementById('info-sitioweb');
        sitioWebElement.href = edificio.sitioweb;
        sitioWebElement.textContent = edificio.sitioweb;
    
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
        // Remueve los event listeners previos
        const deleteButton = document.getElementById("delete-marker");

        deleteButton.replaceWith(deleteButton.cloneNode(true));

        // Añade nuevos event listeners
        document.getElementById("delete-marker").addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('¿Estás seguro de que quieres eliminar este edificio?')) {
                eliminarEdificio(edificio.id_edificios);
                ocultarInfoBox();
            }
        });


        const editButton = document.getElementById("edit-marker");
        editButton.replaceWith(editButton.cloneNode(true));
        document.getElementById("edit-marker").addEventListener('click', (e) => {
            e.stopPropagation();
            abrirModalEdicion(edificio);
        });
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

    document.querySelector('.user-button').addEventListener('click', function () {
        document.querySelector('.dropdown-menu').classList.toggle('show');
    });

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

    // Función para abrir el modal de edición
    function abrirModalEdicion(edificio) {
        const modal = document.getElementById('editarEdificioModal');
        const form = document.getElementById('editarEdificioForm');

        // Rellenar el formulario con los datos del edificio
        document.getElementById('editNombre').value = edificio.nombre || '';
        document.getElementById('editDireccion').value = edificio.direccion || '';
        document.getElementById('editImagen').value = edificio.imagen_url || '';
        document.getElementById('editHorarioInicio').value = edificio.horario_inicio || '';
        document.getElementById('editHorarioFin').value = edificio.horario_final || '';
        document.getElementById('editSitioWeb').value = edificio.sitioweb || '';
        document.getElementById('editLatitud').value = edificio.latitud || '';
        document.getElementById('editLongitud').value = edificio.longitud || '';

        // Seleccionar el tipo de edificio correcto (usando el ID)
        const tipoEdificioSelect = document.getElementById('editTipoEdificio');
        const tipoEdificioId = edificio.tipo_edificio || '';  // ID del tipo de edificio

        // Resetear la selección
        tipoEdificioSelect.selectedIndex = -1;

        // Buscar y seleccionar la opción correcta usando el ID
        for (let i = 0; i < tipoEdificioSelect.options.length; i++) {
            if (tipoEdificioSelect.options[i].value == tipoEdificioId) {
                tipoEdificioSelect.selectedIndex = i;
                break;
            }
        }

        // Marcar las casillas de accesibilidad (usando los IDs de accesibilidad)
        const accesibilidades = edificio.accesibilidad ? edificio.accesibilidad.split(',').map(item => item.trim()) : [];
        document.querySelectorAll('#editAccesibilidadContainer input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = accesibilidades.includes(checkbox.value);  // Asegúrate de comparar por ID
        });

        // Mostrar el modal después de un pequeño retraso
        setTimeout(() => {
            modal.style.display = 'block';
        }, 100);

        // Manejar el envío del formulario
        form.onsubmit = function (e) {
            e.preventDefault();
            guardarCambios(edificio.id_edificios);  // Usar el ID del edificio al guardar
        };

        // Cerrar el modal
        document.querySelector('#editarEdificioModal .close').onclick = function () {
            modal.style.display = 'none';
        };
    }

    // Función para guardar los cambios
    function guardarCambios(id) {
        const form = document.getElementById('editarEdificioForm');
        const formData = new FormData(form);

        // Crear un objeto con los datos del formulario
        const edificioActualizado = {
            nombre: formData.get('nombre'),
            tipo_edificio: formData.get('tipoEdificio'),  // Este es el ID del tipo de edificio
            direccion: formData.get('direccion'),
            imagen_url: formData.get('imagen'),
            horario_inicio: formData.get('horarioInicio'),
            horario_final: formData.get('horarioFin'),
            sitioweb: formData.get('sitioWeb'),
            latitud: formData.get('latitud'),
            longitud: formData.get('longitud'),
            tipo_accesibilidad: Array.from(formData.getAll('accesibilidad'))  // Mantenerlos como cadenas
        };

        // Enviar los datos actualizados al servidor
        fetch(`/edit_edificio/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(edificioActualizado)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Edificio actualizado con éxito');
                    document.getElementById('editarEdificioModal').style.display = 'none';
                    location.reload(); // Recargar la página para actualizar los datos
                } else {
                    alert('Error al actualizar el edificio: ' + (data.error || 'Error desconocido'));
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error al actualizar el edificio');
            });
    }




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
            alert("No se pudo obtener tu ubicación actual. Por favor, activa la geolocalización.");
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

    document.addEventListener('DOMContentLoaded', function() {
        const routeModal = document.getElementById('routeModal');
        const walkingMode = document.getElementById('walkingMode');
        const drivingMode = document.getElementById('drivingMode');
        const closeButton = document.querySelector('.route-modal-close');
    
        function setActiveMode(button) {
            walkingMode.classList.remove('active');
            drivingMode.classList.remove('active');
            button.classList.add('active');
        }
    
        walkingMode.addEventListener('click', function() {
            setActiveMode(this);
        });
    
        drivingMode.addEventListener('click', function() {
            setActiveMode(this);
        });
    
        closeButton.addEventListener('click', function() {
            routeModal.style.display = 'none';
        });
    });


/*---------------------------------------------------------------------------------------------*/



}




