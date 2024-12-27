// Espera a que el DOM esté completamente cargado
document.addEventListener("DOMContentLoaded", function () {
  // Obtiene referencias a los elementos del DOM
  const addAccesoBtn = document.getElementById("addAccesoBtn");
  const modal = document.getElementById("tiposModal");
  const closeBtn = modal.querySelector(".close");
  const form = document.getElementById("tiposForm");
  const tiposList = document.getElementById("tiposList");
  const errorContainer = document.createElement("div");
  errorContainer.className = "modal-errors"; // Clase para estilizar mensajes de error
  form.appendChild(errorContainer); // Agrega el contenedor de errores al formulario

  let isEditing = false; // Bandera para determinar si se está editando un tipo de acceso

  // Asigna eventos a los botones y formulario
  addAccesoBtn.addEventListener("click", () => openModal()); // Abre el modal para agregar acceso
  closeBtn.addEventListener("click", closeModal); // Cierra el modal
  form.addEventListener("submit", handleFormSubmit); // Maneja el envío del formulario

  loadAccesos(); // Carga la lista inicial de accesos

  // Abre el modal para agregar o editar un acceso
  function openModal(acceso = null) {
    isEditing = !!acceso; // Determina si es una edición
    document.getElementById("modalTitle").textContent = isEditing
      ? "Editar Acceso"
      : "Añadir Acceso";

    if (acceso) {
      // Si es edición, llena los campos con los datos del acceso
      document.getElementById("tiposId").value = acceso.id || "";
      document.getElementById("nombre").value = acceso.nombre || "";
      document.getElementById("exterior_accesibilidad").value = acceso.exterior_accesibilidad !== undefined ? acceso.exterior_accesibilidad : "";
    } else {
      // Si es agregar, resetea los campos
      form.reset();
      document.getElementById("tiposId").value = "";
    }
    clearErrors(); // Limpia mensajes de error
    modal.style.display = "block"; // Muestra el modal
    modal.setAttribute("aria-hidden", "false"); // Asegura accesibilidad
  }

  // Cierra el modal y limpia los campos
  function closeModal() {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true"); // Asegura accesibilidad
    form.reset();
    clearErrors();
  }

  // Maneja el envío del formulario
  function handleFormSubmit(e) {
    e.preventDefault(); // Evita el envío estándar del formulario
    if (validateForm()) {
      // Valida los datos
      const formData = new FormData(form); // Crea un objeto FormData con los datos del formulario
      const tiposId = formData.get("tiposId"); // Obtiene el ID del acceso
      const url = tiposId ? `/edit_access/${tiposId}` : "/add_access"; // Define la URL dependiendo si es edición o creación
      const method = tiposId ? "PUT" : "POST"; // Define el método HTTP

      // Log para verificar los datos enviados
      console.log("Datos del formulario:", Object.fromEntries(formData));
      console.log("URL:", url);
      console.log("Método HTTP:", method);

      // Envía los datos al servidor
      fetch(url, { method, body: formData })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            alert(
              isEditing
                ? "Acceso actualizado con éxito"
                : "Acceso agregado con éxito"
            );
            closeModal(); // Cierra el modal
            loadAccesos(); // Recarga la lista de accesos
          } else {
            showModalError("Error: " + data.error); // Muestra mensaje de error

          }
        })
        .catch((error) => {
          console.error("Error:", error);
          showModalError("Error al procesar la solicitud");

        });
    }
  }

  // Valida los datos del formulario
  function validateForm() {
    let isValid = true;
    clearErrors(); // Limpia errores previos

    const nombre = document.getElementById("nombre");

    // Valida que no contenga símbolos pero permite espacios entre palabras
    if (!/^[a-zA-Z\u00C0-\u017F ]+$/.test(nombre.value)) {
      showError(nombre, "El nombre solo puede contener letras y espacios");
      isValid = false;
    }

    return isValid; // Retorna el estado de validación
  }

  // Muestra un error en un campo específico
  function showError(input, message) {
    const errorElement = document.createElement("div");
    errorElement.className = "error-message";
    errorElement.textContent = message;
    input.classList.add("error");
    input.parentNode.insertBefore(errorElement, input.nextSibling);
  }

  // Muestra un error general en el modal
  function showModalError(message) {
    errorContainer.innerHTML = `<p class="modal-error-message">${message}</p>`;
    errorContainer.style.display = "block"; // Asegura que el contenedor sea visible
  }

  // Limpia errores del formulario
  function clearErrors() {
    const errorInputs = form.querySelectorAll(".error");
    const errorMessages = form.querySelectorAll(".error-message");
    errorInputs.forEach((input) => input.classList.remove("error"));
    errorMessages.forEach((message) => message.remove());

    errorContainer.innerHTML = ""; // Limpia el contenedor de errores
    errorContainer.style.display = "none"; // Oculta el contenedor
  }

  // Carga la lista de accesos
  function loadAccesos() {
    fetch("/get_accesses")
      .then((response) => response.json())
      .then((accesos) => {
        tiposList.innerHTML = "";
        accesos.forEach((acceso) => {
          const row = createAccesoRow(acceso); // Crea una fila por cada acceso
          tiposList.appendChild(row);
        });
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("Error al cargar accesos");
      });
  }

  // Crea una fila en la lista de accesos
  function createAccesoRow(acceso) {
    const row = document.createElement("tr");
    row.innerHTML = `
              <td class="truncate-email">${acceso.nombre}</td>
              <td class="truncate-email">${acceso.exterior_accesibilidad}</td>
              <td>
                  <div class="action-buttons">
                      <button class="edit-button" onclick="editAcceso(${acceso.id})">
                          <i class="fas fa-edit"></i>
                      </button>
                      <button class="delete-button" onclick="deleteAcceso(${acceso.id})">
                          <i class="fas fa-trash-alt"></i>
                      </button>
                  </div>
              </td>
          `;
    return row;
  }

  // Maneja la edición de un acceso
  window.editAcceso = function (id) {
    fetch(`/get_access/${id}`)
      .then((response) => response.json())
      .then((acceso) => {
        openModal(acceso); // Abre el modal con los datos del acceso
      })
      .catch((error) => {
        console.error("Error:", error);
        showModalError("Error al cargar los datos del acceso");
      });
  };

  // Maneja la eliminación de un acceso
  window.deleteAcceso = function (id) {
    if (confirm("¿Estás seguro de que quieres eliminar este acceso?")) {
      fetch(`/delete_access/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      })
        .then((response) => {
          if (!response.ok) {
            return response.json().then((data) => {
              throw new Error(
                data.error || `HTTP error! Status: ${response.status}`
              );
            });
          }
          return response.json();
        })
        .then((data) => {
          if (data.success) {
            alert("Acceso eliminado con éxito");
            loadAccesos(); // Recarga la lista de accesos
          } else {
            alert(`Error al eliminar acceso: ${data.error}`);
            showModalError(`Error al eliminar acceso: ${data.error}`);
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          alert(`Error al eliminar acceso: ${error.message}`);
          showModalError(
            `Error al eliminar acceso. Detalles: ${error.message}`
          );
        });
    }
  };

  // Función para crear las filas en la tabla de accesos
  function createAccesoRow(acceso) {
    const row = document.createElement("tr");

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
    deleteButton.style.color = "red"; // Rojo por defecto
    deleteButton.disabled = true; // Desactivado por defecto

    // Verificar si el acceso está en uso
    fetch(`/check_access_usage/${acceso.id}`)
      .then((response) => response.json())
      .then((data) => {
        if (!data.in_use) {
          deleteButton.disabled = false; // Habilitar si no está en uso
          deleteButton.title = ""; // Quitar cualquier mensaje
          deleteButton.style.color = "red"; // Mantener el color rojo
          deleteButton.onmouseover = null; // Quitar el evento de mouseover
          deleteButton.onclick = () => deleteAcceso(acceso.id); // Permitir eliminación
        } else {
          deleteButton.title =
            "Este acceso se encuentra en uso y no puede ser eliminado.";
          deleteButton.style.color = "gray"; // Cambiar a gris
          deleteButton.onmouseover = () => {
            const tooltip = document.createElement("div");
            tooltip.className = "tooltip";
            document.body.appendChild(tooltip);

            // Posicionar el tooltip cerca del cursor
            deleteButton.onmousemove = (e) => {
              tooltip.style.top = `${e.pageY + 10}px`;
              tooltip.style.left = `${e.pageX + 10}px`;
            };
          };

          deleteButton.onmouseout = () => {
            // Quitar el tooltip al salir del ícono
            document.querySelectorAll(".tooltip").forEach((el) => el.remove());
          };
        }
      })
      .catch((error) => {
        console.error("Error al verificar el uso del acceso:", error);
      });

    // Modifica la línea para mostrar "Sí" o "No" según el valor de exterior_accesibilidad
    const exteriorAccesibilidadText = acceso.exterior_accesibilidad === 0 ? "No" : "Sí";

    row.innerHTML = `
        <td>${acceso.nombre}</td>
        <td>${exteriorAccesibilidadText}</td> 
        <td>
            <div class="action-buttons">
                <button class="edit-button" onclick="editAcceso(${acceso.id})">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        </td>
      `;
    row.querySelector(".action-buttons").appendChild(deleteButton);
    return row;
  }

});