document.addEventListener('DOMContentLoaded', function() {
    // Obtiene referencias a los elementos clave del DOM
    const agregarBtn = document.getElementById('agregar-marcador'); // Botón para abrir el modal
    const modalAgregar = document.getElementById('agregarEdificioModal'); // Modal para agregar un edificio

    // Comprueba si los elementos existen antes de agregar eventos
    if (agregarBtn && modalAgregar) {
        agregarBtn.addEventListener('click', function() {
            mostrarModal(modalAgregar); // Muestra el modal cuando se hace clic en el botón
        });
    }

    // Función para mostrar el modal
    function mostrarModal(modal) {
        modal.style.display = 'block'; // Cambia el estilo del modal para hacerlo visible
        setupModalEvents(modal); // Configura los eventos relacionados con el modal
    }

    // Configura eventos dentro del modal
    function setupModalEvents(modal) {
        const closeBtn = modal.querySelector('.close'); // Botón de cerrar en el modal
        if (closeBtn) {
            closeBtn.onclick = function() {
                modal.style.display = 'none'; // Cierra el modal al hacer clic en el botón de cerrar
            };
        }
    }

    // Función para limitar los caracteres ingresados en los campos de latitud y longitud
    function limitarCaracteres(event, maxLength) {
        const input = event.target;
        if (input.value.length > maxLength) {
            input.value = input.value.substring(0, maxLength); // Corta el valor al máximo permitido
        }
    }

    // Configura la validación para los campos de latitud y longitud
    document.getElementById('latitud').addEventListener('input', function(event) {
        limitarCaracteres(event, 18); // Limita la latitud a 18 caracteres
    });

    document.getElementById('longitud').addEventListener('input', function(event) {
        limitarCaracteres(event, 18); // Limita la longitud a 18 caracteres
    });

    // Maneja el envío del formulario para agregar un edificio
    document.getElementById('agregarEdificioForm').addEventListener('submit', function(event) {
        event.preventDefault(); // Previene el envío tradicional del formulario

        // Recopila los datos del formulario
        const nombre = document.getElementById('nombre').value;
        const tipoEdificio = document.getElementById('tipoEdificio').value;
        const direccion = document.getElementById('direccion').value;
        const imagen = document.getElementById('imagen').value;
        const horarioInicio = document.getElementById('horarioInicio').value;
        const horarioFin = document.getElementById('horarioFin').value;
        const sitioWeb = document.getElementById('sitioWeb').value;
        const latitud = parseFloat(document.getElementById('latitud').value);
        const longitud = parseFloat(document.getElementById('longitud').value);

        // Valida que latitud y longitud sean números válidos
        if (isNaN(latitud) || isNaN(longitud)) {
            alert("Latitud y Longitud deben ser valores numéricos válidos.");
            return; // Termina la ejecución si la validación falla
        }

        // Recopila las opciones de accesibilidad seleccionadas
        const accesibilidad = [];
        document.querySelectorAll('#accesibilidadContainer input[type="checkbox"]:checked').forEach(function(checkbox) {
            accesibilidad.push(checkbox.value);
        });

        // Prepara los datos para enviarlos al servidor
        const formData = {
            nombre: nombre,
            tipo_edificio: tipoEdificio,
            direccion: direccion,
            imagen_url: imagen,
            horario_inicio: horarioInicio,
            horario_final: horarioFin,
            sitioweb: sitioWeb,
            latitud: latitud,
            longitud: longitud,
            accesibilidad: accesibilidad
        };

        // Envío de los datos al servidor mediante una solicitud POST
        fetch('/add_edificio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData) // Convierte los datos a formato JSON
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert("Edificio agregado exitosamente!"); // Notifica al usuario en caso de éxito
                modalAgregar.style.display = 'none'; // Cierra el modal
                location.reload(); // Recarga la página para reflejar los cambios
            } else {
                alert("Error: " + (data.error || "No se pudo agregar el edificio")); // Muestra errores específicos
            }
        })
        .catch(error => {
            alert("Error en la conexión: " + error); // Manejo de errores en la conexión
        });
    });
});





