let selectedMarker = null;

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

    fetch('/get_edificios')
        .then(response => response.json())
        .then(data => {
            agregarMarcadores(data, map);
        })
        .catch(error => console.error('Error:', error));

        
    let userLocationAccuracyCircle; // Variable global para el círculo de precisión
    let userLocationMarker;

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };

                // Crear o mover el marcador de la ubicación del usuario
                if (!userLocationMarker) {
                    userLocationMarker = new google.maps.Marker({
                        position: pos,
                        map: map,
                        title: "Tu ubicación actual",
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: "#4285F4",
                            fillOpacity: 1,
                            strokeColor: "white",
                            strokeWeight: 2,
                        },
                    });

                    userLocationAccuracyCircle = new google.maps.Circle({
                        strokeColor: "#4285F4",
                        strokeOpacity: 0.4,
                        strokeWeight: 1,
                        fillColor: "#4285F4",
                        fillOpacity: 0.1,
                        map: map,
                        center: pos,
                        radius: position.coords.accuracy,
                    });
                } else {
                    userLocationMarker.setPosition(pos);
                    userLocationAccuracyCircle.setCenter(pos);
                    userLocationAccuracyCircle.setRadius(position.coords.accuracy);
                }
            },
            () => {
                handleLocationError(true, map.getCenter(), map);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000,
            }
        );
    } else {
        handleLocationError(false, map.getCenter(), map);
    }


    





    const infoBox = document.getElementById("info-box");

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

    // Función para crear los marcadores
    function agregarMarcadores(edificios) {
        edificios.forEach(edificio => {
            const marker = new google.maps.Marker({
                position: { lat: parseFloat(edificio.latitud), lng: parseFloat(edificio.longitud) },
                map: map,
                title: edificio.nombre,
            });
    
            marker.addListener('click', function () {
                // Cambiar color del marcador seleccionado
                if (selectedMarker) {
                    selectedMarker.setIcon(null); // Restablece el ícono anterior del marcador
                }
    
                this.setIcon({
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: "#FF0000", // Nuevo color al seleccionar (rojo)
                    fillOpacity: 1,
                    strokeColor: "#FFFFFF",
                    strokeWeight: 2,
                });
    
                selectedMarker = this; // Almacena el marcador seleccionado
    
                // Agregar animación (ejemplo de rebote)
                this.setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => {
                    this.setAnimation(null); // Detener la animación después de 2 segundos
                }, 2000);
    
                // Código para mostrar el infoBox como antes
                const accesibilidadArray = edificio.accesibilidad.split(',');
                const accesibilidadList = accesibilidadArray.map(item => `<li>${item.trim()}</li>`).join('');
                infoBox.innerHTML = `
                    <button id="close-info-box" class="close-button">X</button>
                    <img src="https://www.monumentos.gob.cl/sites/default/files/styles/slide_monumentos/public/image-monumentos/mh_00224_2017_tf_017.jpg?itok=oOintJTc" style="width: 100%; height: auto; border-radius: 8px; margin-bottom: 10px;">
                    <h3>${edificio.nombre}</h3>
                    <p>Horario de Atencion: 8:30 AM a 7:00 PM</p>
                    <p>Accesibilidad: </p>
                    <ul>${accesibilidadList}</ul>
                `;
                infoBox.style.display = 'block';
    
                const closeButton = document.getElementById("close-info-box");
                closeButton.addEventListener('click', () => {
                    infoBox.style.display = 'none';
                });
            });
        });
    }
    document.getElementById("close-modal").addEventListener("click", function () {
        document.getElementById("form-modal").style.display = 'none';
        limpiarFormulario(); // Llama a la función para limpiar el formulario
    });
}
