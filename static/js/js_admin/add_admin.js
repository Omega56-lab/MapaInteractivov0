// Espera a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function () {
    // Obtiene referencias a los elementos del DOM
    const addAdminBtn = document.getElementById('addAdminBtn'); 
    const modal = document.getElementById('adminModal'); 
    const closeBtn = modal.querySelector('.close'); 
    const form = document.getElementById('adminForm');
    const adminList = document.getElementById('adminList'); 
    const errorContainer = document.createElement('div'); 
    errorContainer.className = 'modal-errors'; // Clase para estilizar mensajes de error
    form.appendChild(errorContainer); // Agrega el contenedor de errores al formulario

    let isEditing = false; // Bandera para determinar si se está editando un administrador

    // Asigna eventos a los botones y formulario
    addAdminBtn.addEventListener('click', () => openModal()); // Abre el modal para agregar administrador
    closeBtn.addEventListener('click', closeModal); // Cierra el modal
    form.addEventListener('submit', handleFormSubmit); // Maneja el envío del formulario

    loadAdmins(); // Carga la lista inicial de administradores

    // Abre el modal para agregar o editar un administrador
    function openModal(admin = null) {
        isEditing = !!admin; // Determina si es una edición
        document.getElementById('modalTitle').textContent = isEditing ? 'Editar Administrador' : 'Agregar Administrador';

        if (admin) {
            // Si es edición, llena los campos con los datos del administrador
            document.getElementById('adminId').value = admin.id_admin || '';
            document.getElementById('nombre').value = admin.nombre_usuario || '';
            document.getElementById('email').value = admin.correo || '';
            document.getElementById('confirmEmail').value = admin.correo || '';
            document.getElementById('password').required = false; // La contraseña no es obligatoria al editar
            document.getElementById('confirmPassword').required = false;
        } else {
            // Si es agregar, resetea los campos
            form.reset();
            document.getElementById('adminId').value = '';
            document.getElementById('password').required = true; // La contraseña es obligatoria
            document.getElementById('confirmPassword').required = true;
        }
        clearErrors(); // Limpia mensajes de error
        modal.style.display = 'block'; // Muestra el modal
    }

    // Cierra el modal y limpia los campos
    function closeModal() {
        modal.style.display = 'none';
        form.reset();
        clearErrors();
    }

    // Maneja el envío del formulario
    function handleFormSubmit(e) {
        e.preventDefault(); // Evita el envío estándar del formulario
        if (validateForm()) { // Valida los datos
            const formData = new FormData(form); // Crea un objeto FormData con los datos del formulario
            const adminId = formData.get('adminId'); // Obtiene el ID del administrador
            const url = adminId ? `/edit_admin/${adminId}` : '/add_admin'; // Define la URL dependiendo si es edición o creación
            const method = adminId ? 'PUT' : 'POST'; // Define el método HTTP

            // Envía los datos al servidor
            fetch(url, { method, body: formData })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert(isEditing ? 'Administrador actualizado con éxito' : 'Administrador agregado con éxito');
                        closeModal(); // Cierra el modal
                        loadAdmins(); // Recarga la lista de administradores
                    } else {
                        showModalError('Error: ' + data.error); // Muestra mensaje de error
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showModalError('Error al procesar la solicitud');
                });
        }
    }

    // Valida los datos del formulario
    function validateForm() {
        let isValid = true;
        clearErrors(); // Limpia errores previos
    
        const email = document.getElementById('email');
        const confirmEmail = document.getElementById('confirmEmail');
        const password = document.getElementById('password');
        const confirmPassword = document.getElementById('confirmPassword');
    
        // Valida que no haya espacios en blanco en email y contraseña
        if (/\s/.test(email.value)) {
            showError(email, 'El email no puede contener espacios en blanco');
            isValid = false;
        }
        if (/\s/.test(password.value)) {
            showError(password, 'La contraseña no puede contener espacios en blanco');
            isValid = false;
        }
    
        // Compara emails
        if (email.value !== confirmEmail.value) {
            showError(email, 'Los emails no coinciden');
            showError(confirmEmail, 'Los emails no coinciden');
            isValid = false;
        }
    
        // Compara contraseñas si están ingresadas
        if (password.value || confirmPassword.value) {
            if (password.value !== confirmPassword.value) {
                showError(password, 'Las contraseñas no coinciden');
                showError(confirmPassword, 'Las contraseñas no coinciden');
                isValid = false;
            }
        }
    
        return isValid; // Retorna el estado de validación
    }

    // Muestra un error en un campo específico
    function showError(input, message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        input.classList.add('error');
        input.parentNode.insertBefore(errorElement, input.nextSibling);
    }

    // Muestra un error general en el modal
    function showModalError(message) {
        errorContainer.innerHTML = `<p class="modal-error-message">${message}</p>`;
        errorContainer.style.display = 'block'; // Asegura que el contenedor sea visible
    }

    // Limpia errores del formulario
    function clearErrors() {
        const errorInputs = form.querySelectorAll('.error');
        const errorMessages = form.querySelectorAll('.error-message');
        errorInputs.forEach(input => input.classList.remove('error'));
        errorMessages.forEach(message => message.remove());

        errorContainer.innerHTML = ''; // Limpia el contenedor de errores
        errorContainer.style.display = 'none'; // Oculta el contenedor
    }

    // Carga la lista de administradores
    function loadAdmins() {
        fetch('/get_admins')
            .then(response => response.json())
            .then(admins => {
                adminList.innerHTML = '';
                admins.forEach(admin => {
                    const row = createAdminRow(admin); // Crea una fila por cada administrador
                    adminList.appendChild(row);
                });
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error al cargar administradores');
            });
    }

    // Crea una fila en la lista de administradores
    function createAdminRow(admin) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="truncate-email">${admin.nombre_usuario}</td>
            <td class="truncate-email">${admin.correo}</td>
            <td>${admin.rol_id === 1 ? 'Super Admin' : 'Admin'}</td>
            <td>
                <div class="action-buttons">
                    <button class="edit-button" onclick="editAdmin(${admin.id_admin})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-button" onclick="deleteAdmin(${admin.id_admin})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        `;
        return row;
    }

    // Maneja la edición de un administrador
    window.editAdmin = function (id) {
        fetch(`/get_admin/${id}`)
            .then(response => response.json())
            .then(admin => {
                openModal(admin); // Abre el modal con los datos del administrador
            })
            .catch(error => {
                console.error('Error:', error);
                showModalError('Error al cargar los datos del administrador');
            });
    };

    // Maneja la eliminación de un administrador
    window.deleteAdmin = function (id) {
        if (confirm('¿Estás seguro de que quieres eliminar este administrador?')) {
            fetch(`/delete_admin/${id}`, { method: 'DELETE' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('Administrador eliminado con éxito');
                        loadAdmins(); // Recarga la lista de administradores
                    } else {
                        showModalError('Error al eliminar administrador: ' + data.error);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showModalError('Error al eliminar administrador');
                });
        }
    };
});
