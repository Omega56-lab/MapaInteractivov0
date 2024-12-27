# Importaciones necesarias para la aplicación
from flask import Flask, request, jsonify, render_template, redirect, url_for, abort, session
from functools import wraps
import mysql.connector
import bcrypt
import os 
import string
import random
import smtplib
from email.message import EmailMessage
import ssl
from dotenv import load_dotenv

# Carga las variables de entorno
load_dotenv()

app = Flask(__name__)

# Configuración de la base de datos
db_config = {
    'host': os.getenv('DB_HOST'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME')
}

# Configuración de claves y credenciales
API_KEY = os.getenv('API_KEY')
email_sender = os.getenv("EMAIL_SENDER")
email_password = os.getenv("EMAIL_PASSWORD")
app.secret_key = os.getenv('SECRET_KEY') 

# Página principal
@app.route('/')
def home():
    return render_template('user/user.html', api_key=API_KEY)

# Decorador para verificar si el usuario ha iniciado sesión
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            abort(404) 
        return f(*args, **kwargs)
    return decorated_function

# RUTA: Maneja el inicio de sesión
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        correo = request.form['correo']
        password = request.form['password']

        try:
            conn = mysql.connector.connect(**db_config)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM usuario_admin WHERE correo = %s", (correo,))
            user = cursor.fetchone()

            if user and bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
                if user['cuenta_nueva']:  # Verificar si el usuario tiene cuenta nueva
                    session['logged_in'] = True
                    session['user_id'] = user['id_admin']
                    session['user_name'] = user['nombre_usuario'] 
                    session['correo'] = user['correo']
                    session['rol_id'] = user['rol_id']
                    session['step'] = 'change'  # Indicar que el usuario debe cambiar la contraseña
                    return redirect(url_for('change_password'))  # Redirigir al cambio de contraseña

                # Si no es cuenta nueva, procede normalmente
                session['logged_in'] = True
                session['user_id'] = user['id_admin']
                session['user_name'] = user['nombre_usuario']
                session['rol_id'] = user['rol_id']
                return redirect(url_for('index'))

            else:
                error_message = "Credenciales incorrectas. Intenta de nuevo."
                return render_template('login/login.html', error=error_message)  

        except mysql.connector.Error as e:
            return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
        finally:
            cursor.close()
            conn.close()

    return render_template('login/login.html')

# Decorador para verificar pasos específicos en la recuperación de contraseña
def requires_recovery_step(required_step):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if session.get('step') != required_step:
                abort(404)  # Forbidden o redirige a la recuperación
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# RUTA: Recuperación de contraseña
@app.route('/recovery', methods=['GET', 'POST'])
def recovery():
    def send_verification_code(email, code):
        subject = "Código de recuperación"
        body = f"Su código de recuperación es: {code}"

        em = EmailMessage()
        em["From"] = email_sender
        em["To"] = email
        em["Subject"] = subject
        em.set_content(body)

        context = ssl.create_default_context()

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as smtp:
            smtp.login(email_sender, email_password)
            smtp.sendmail(email_sender, email, em.as_string())

    if request.method == 'POST':
        correo = request.form['correo']
        
        # Verificar si el correo existe
        try:
            conn = mysql.connector.connect(**db_config)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM usuario_admin WHERE correo = %s", (correo,))
            user = cursor.fetchone()

            if user:
                code = ''.join(random.choices(string.digits, k=6))
                send_verification_code(correo, code)
                session['verification_code'] = code
                session['correo'] = correo
                session['step'] = 'code'  
                return redirect(url_for('recovery_step'))

            else:
                error_message = "El correo no está registrado."
                return render_template('login/recovery.html', error=error_message)

        except mysql.connector.Error as e:
            return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
        finally:
            cursor.close()
            conn.close()

    return render_template('login/recovery.html')

# RUTA: Maneja el paso de verificación de código
@app.route('/recovery_step', methods=['GET', 'POST'])
@requires_recovery_step('code')
def recovery_step():
    if session.get('step') == 'code':
        if request.method == 'POST':
            code_input = ''.join(request.form.getlist('codigo'))  

            if code_input == session.get('verification_code'):
                session['step'] = 'change' 
                return redirect(url_for('change_password'))

            error_message = "Código incorrecto."
            return render_template('login/code_recovery.html', error=error_message)

        return render_template('login/code_recovery.html')

 
    return redirect(url_for('recovery')) 

# RUTA: Cambio de contraseña
@app.route('/change_password', methods=['GET', 'POST'])
@requires_recovery_step('change')
def change_password():
    if request.method == 'POST':
        new_password = request.form['password']
        confirm_password = request.form.get('confirm_password') 

        if new_password == confirm_password:
            try:
                conn = mysql.connector.connect(**db_config)
                cursor = conn.cursor()
                hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
                cursor.execute(
                    "UPDATE usuario_admin SET password_hash = %s, cuenta_nueva = FALSE WHERE correo = %s",
                    (hashed_password, session['correo'])
                )
                conn.commit()

                session.pop('verification_code', None)
                session.pop('correo', None)
                session.pop('step', None)

                success_message = 'Contraseña cambiada exitosamente. Por favor, inicia sesión.'
                return render_template('login/login.html', success=success_message)

            except mysql.connector.Error as e:
                return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
        
        error_message = "Las contraseñas no coinciden."
        return render_template('login/change_password.html', error=error_message)

    return render_template('login/change_password.html')

# Ruta de administración principal
@app.route('/admin', methods=['GET', 'POST'])
@login_required  
def index():
    user_role = session.get('rol_id')
    return render_template('admin/admin.html', api_key=API_KEY, user_role=user_role)  

# RUTA: Cierre de sesión
@app.route('/logout')
@login_required  
def logout():
    session.pop('logged_in', None)  
    return redirect(url_for('home'))  



# Ruta: obtecion de datos de base de datos de los edificios
@app.route('/get_edificios', methods=['GET'])
def get_edificios():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT e.id_edificios, e.nombre, e.direccion, e.imagen_url, t.nombre_tipo AS tipo_edificio, 
                e.horario_inicio, e.horario_final, e.sitioweb, e.latitud, e.longitud, 
                GROUP_CONCAT(a.nombre SEPARATOR ', ') AS accesibilidad
            FROM edificios e
            LEFT JOIN edificios_accesibilidad ea ON e.id_edificios = ea.edificio_id
            LEFT JOIN tipos_accesibilidad a ON ea.tipo_accesibilidad_id = a.id_tipos
            LEFT JOIN tipos_edificios t ON e.tipo_edificio = t.id_tipos_edificios
            GROUP BY e.id_edificios;
        """

        cursor.execute(query)
        edificios = cursor.fetchall()

        return jsonify(edificios), 200
    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Error general: {str(e)}"}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

# Ruta para agregar los edificios a la base de datos
@app.route('/add_edificio', methods=['POST'])
@login_required
def add_edificio():
    data = request.get_json()

    # Campos del formulario
    nombre = data['nombre']
    direccion = data['direccion']
    imagen_url = data.get('imagen_url')
    horario_inicio = data['horario_inicio']
    horario_final = data['horario_final']
    sitioweb = data.get('sitioweb')
    latitud = data['latitud']
    longitud = data['longitud']
    tipo_edificio_id = data['tipo_edificio']  # Ahora se recibe directamente el ID del tipo de edificio
    tipo_accesibilidad_ids = data['tipo_accesibilidad']  # Lista de IDs de accesibilidades seleccionadas

    # Obtener conexión a la base de datos
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    try:
        # Comprobar si ya existe un edificio con la misma latitud y longitud
        cursor.execute("""
            SELECT COUNT(*) FROM edificios WHERE latitud = %s AND longitud = %s
        """, (latitud, longitud))
        
        resultado = cursor.fetchone()
        if resultado[0] > 0:
            return jsonify({"error": "Ya existe un edificio con esta Latitud y Longitud"}), 400

        # Insertar el edificio con los nuevos campos
        cursor.execute("""
            INSERT INTO edificios (nombre, direccion, imagen_url, tipo_edificio, horario_inicio, horario_final, sitioweb, latitud, longitud)
            VALUES (%s, %s, %s, (SELECT id_tipos_edificios FROM tipos_edificios WHERE nombre_tipo = %s), %s, %s, %s, %s, %s)
        """, (nombre, direccion, imagen_url, tipo_edificio_id, horario_inicio, horario_final, sitioweb, latitud, longitud))
        
        edificio_id = cursor.lastrowid  # Obtener el ID del edificio recién agregado

        # Insertar cada tipo de accesibilidad individualmente
        for tipo_id in tipo_accesibilidad_ids:
            cursor.execute("""
                INSERT INTO edificios_accesibilidad (edificio_id, tipo_accesibilidad_id)
                VALUES (%s, %s)
            """, (edificio_id, tipo_id))
        
        # Confirmar los cambios
        conn.commit()
        return jsonify(success=True)

    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Error general: {str(e)}"}), 500
    finally:
        cursor.close()
        conn.close()



# Ruta de eliminar el edificio por su id en la base de datos
@app.route('/delete_edificio/<int:edificio_id>', methods=['DELETE'])
@login_required
def delete_edificio(edificio_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Eliminar las entradas de la tabla de accesibilidad primero
        cursor.execute("DELETE FROM edificios_accesibilidad WHERE edificio_id = %s", (edificio_id,))
        
        # Eliminar el edificio
        cursor.execute("DELETE FROM edificios WHERE id_edificios = %s", (edificio_id,))
        
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify(success=True)
    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Error general: {str(e)}"}), 500
        
# Ruta para editar los datos del edificio en la base de datos
@app.route('/edit_edificio/<int:id>', methods=['PUT'])
@login_required
def edit_edificio(id):
    data = request.get_json()

    # Campos del formulario
    nombre = data['nombre']
    direccion = data['direccion']
    imagen_url = data.get('imagen_url')
    horario_inicio = data['horario_inicio']
    horario_final = data['horario_final']
    sitioweb = data['sitioweb']
    latitud = data['latitud']
    longitud = data['longitud']
    tipo_edificio_nombre = data['tipo_edificio']  # Recibimos el nombre del tipo de edificio
    tipo_accesibilidad = data['tipo_accesibilidad']  # Lista de IDs de accesibilidad

    # Conexión con la base de datos
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    try:
        # Comprobar si ya existe un edificio con la misma latitud y longitud, excepto el que se está editando
        cursor.execute("""
            SELECT COUNT(*) FROM edificios WHERE latitud = %s AND longitud = %s AND id_edificios != %s
        """, (latitud, longitud, id))
        
        resultado = cursor.fetchone()
        if resultado[0] > 0:
            return jsonify({"error": "Ya existe un edificio con esta Latitud y Longitud"}), 400

        # Obtener el ID del tipo de edificio basado en el nombre
        cursor.execute("""
            SELECT id_tipos_edificios FROM tipos_edificios WHERE nombre_tipo = %s
        """, (tipo_edificio_nombre,))
        tipo_edificio_result = cursor.fetchone()

        # Si no se encuentra el tipo de edificio, retornar error
        if not tipo_edificio_result:
            return jsonify({"error": "Tipo de edificio no encontrado"}), 400

        tipo_edificio_id = tipo_edificio_result[0]  # El ID del tipo de edificio

        # Actualizar los datos del edificio
        cursor.execute("""
            UPDATE edificios
            SET nombre = %s, direccion = %s, imagen_url = %s, tipo_edificio = %s,
                horario_inicio = %s, horario_final = %s, sitioweb = %s, latitud = %s, longitud = %s
            WHERE id_edificios = %s
        """, (nombre, direccion, imagen_url, tipo_edificio_id, horario_inicio, horario_final, sitioweb, latitud, longitud, id))

        # Eliminar accesibilidades previas y agregar las nuevas
        cursor.execute("DELETE FROM edificios_accesibilidad WHERE edificio_id = %s", (id,))
        for tipo in tipo_accesibilidad:
            cursor.execute("""
                INSERT INTO edificios_accesibilidad (edificio_id, tipo_accesibilidad_id)
                VALUES (%s, %s)
            """, (id, tipo))

        # Confirmar los cambios
        conn.commit()
        return jsonify(success=True)

    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Error general: {str(e)}"}), 500
    finally:
        cursor.close()
        conn.close()


# Decoracion donde verifica que si el admin ingresado es Superadmin o admin por su tipo de admin
def super_admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in') or session.get('rol_id') != 1:
            return jsonify({"success": False, "error": "Acceso no autorizado"}), 403
        return f(*args, **kwargs)
    return decorated_function

# Ruta de la pagina del manejo de admin
@app.route('/admin/manage')
@login_required
@super_admin_required
def admin_management():
    return render_template('admin/add_admin.html')


@app.route('/get_acessibilidad', methods=['GET'])
@login_required
def get_acessibilidad():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT * FROM tipos_accesibilidad")
        acessibilidad = cursor.fetchall()

        return jsonify(acessibilidad), 200
    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta donde agrega el admin a la base de datos
@app.route('/add_admin', methods=['POST'])
@login_required
@super_admin_required
def add_admin():
    nombre = request.form['nombre']
    email = request.form['email']
    password = request.form['password']
    rol_id = request.form['tipo_admin']

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Verificar si el correo ya está registrado
        cursor.execute("SELECT * FROM usuario_admin WHERE correo = %s", (email,))
        if cursor.fetchone():
            return jsonify({"success": False, "error": "El email ya está registrado"}), 400

        # Generar la salt y el hash
        password_salt = bcrypt.gensalt()
        password_hash = bcrypt.hashpw(password.encode('utf-8'), password_salt)

        # Guardar el usuario en la base de datos, incluyendo la salt
        cursor.execute("""
            INSERT INTO usuario_admin (nombre_usuario, correo, password_hash, password_salt, rol_id, cuenta_nueva)
            VALUES (%s, %s, %s, %s, %s, TRUE)
        """, (nombre, email, password_hash, password_salt, rol_id))

        conn.commit()
        return jsonify({"success": True}), 200

    except mysql.connector.Error as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta donde se obtiene los datos de los admin(2)
@app.route('/get_admins', methods=['GET'])
@login_required
@super_admin_required
def get_admins():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT id_admin, nombre_usuario, correo, rol_id
            FROM usuario_admin
            WHERE rol_id != 1  
        """)

        admins = cursor.fetchall()
        return jsonify(admins), 200

    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta donde se obtiene los datos del admin por su id
@app.route('/get_admin/<int:admin_id>', methods=['GET'])
@login_required
@super_admin_required
def get_admin(admin_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT id_admin, nombre_usuario, correo, rol_id
            FROM usuario_admin
            WHERE id_admin = %s
        """, (admin_id,))

        admin = cursor.fetchone()
        if admin:
            return jsonify(admin), 200
        else:
            return jsonify({"error": "Administrador no encontrado"}), 404

    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta donde se edita al admin seleccionado
@app.route('/edit_admin/<int:admin_id>', methods=['PUT'])
@login_required
@super_admin_required
def edit_admin(admin_id):
    nombre = request.form['nombre']
    email = request.form['email']
    rol_id = request.form['tipo_admin']
    password = request.form.get('password')  # Password es opcional en edición

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Verificar si el email ya está en uso por otro admin
        cursor.execute("SELECT id_admin FROM usuario_admin WHERE correo = %s AND id_admin != %s", (email, admin_id))
        if cursor.fetchone():
            return jsonify({"success": False, "error": "El email ya está en uso por otro administrador"}), 400

        if password:
            hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
            cursor.execute("""
                UPDATE usuario_admin
                SET nombre_usuario = %s, correo = %s, rol_id = %s, password_hash = %s
                WHERE id_admin = %s
            """, (nombre, email, rol_id, hashed_password, admin_id))
        else:
            cursor.execute("""
                UPDATE usuario_admin
                SET nombre_usuario = %s, correo = %s, rol_id = %s
                WHERE id_admin = %s
            """, (nombre, email, rol_id, admin_id))

        conn.commit()
        return jsonify({"success": True}), 200

    except mysql.connector.Error as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta donde elimina al admin por su respectiva id
@app.route('/delete_admin/<int:admin_id>', methods=['DELETE'])
@login_required
@super_admin_required
def delete_admin(admin_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        cursor.execute("SELECT rol_id FROM usuario_admin WHERE id_admin = %s", (admin_id,))
        admin = cursor.fetchone()
        if not admin:
            return jsonify({"success": False, "error": "Administrador no encontrado"}), 404
        if admin[0] == 1:  # Si es super admin
            return jsonify({"success": False, "error": "No se puede eliminar un super admin"}), 403

        cursor.execute("DELETE FROM usuario_admin WHERE id_admin = %s", (admin_id,))
        conn.commit()

        return jsonify({"success": True}), 200

    except mysql.connector.Error as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta de la pagina del manejo de accesibilidad
@app.route('/admin/accessibility')
@login_required
@super_admin_required
def admin_Accessibility():
    return render_template('admin/add_accessibility.html')

# Ruta donde se agrega un acceso a la base de datos
@app.route('/add_access', methods=['POST'])
@login_required
@super_admin_required
def add_access():
    nombre = request.form['nombre']
    exterior_accesibilidad = request.form['exterior_accesibilidad']

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Verificar si el acceso ya está registrado en tipos_accesibilidad
        cursor.execute("SELECT * FROM tipos_accesibilidad WHERE nombre = %s", (nombre,))
        if cursor.fetchone():
            return jsonify({"success": False, "error": "El acceso ya está registrado"}), 400

        # Guardar el acceso en la tabla tipos_accesibilidad
        cursor.execute("INSERT INTO tipos_accesibilidad (nombre, exterior_accesibilidad) VALUES (%s, %s)", (nombre, exterior_accesibilidad))
        conn.commit()
        return jsonify({"success": True}), 200

    except mysql.connector.Error as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta donde se obtiene la lista de accesos
@app.route('/get_accesses', methods=['GET'])
@login_required
@super_admin_required
def get_accesses():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Seleccionar de tipos_accesibilidad
        cursor.execute("SELECT id_tipos AS id, nombre, exterior_accesibilidad FROM tipos_accesibilidad")
        accesses = cursor.fetchall()
        return jsonify(accesses), 200

    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta donde se obtiene un acceso específico por su ID
@app.route('/get_access/<int:access_id>', methods=['GET'])
@login_required
@super_admin_required
def get_access(access_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Seleccionar de tipos_accesibilidad
        cursor.execute("SELECT id_tipos AS id, nombre, exterior_accesibilidad FROM tipos_accesibilidad WHERE id_tipos = %s", (access_id,))
        access = cursor.fetchone()
        if access:
            return jsonify(access), 200
        else:
            return jsonify({"error": "Acceso no encontrado"}), 404

    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta donde se edita un acceso
@app.route('/edit_access/<int:access_id>', methods=['PUT'])
@login_required
@super_admin_required
def edit_access(access_id):
    nombre = request.form['nombre']
    exterior_accesibilidad = request.form['exterior_accesibilidad']

    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Verificar si el nombre ya está en uso en tipos_accesibilidad
        cursor.execute("SELECT id_tipos FROM tipos_accesibilidad WHERE nombre = %s AND id_tipos != %s", (nombre, access_id))
        if cursor.fetchone():
            return jsonify({"success": False, "error": "El nombre ya está en uso por otro acceso"}), 400

        # Actualizar en tipos_accesibilidad
        cursor.execute("UPDATE tipos_accesibilidad SET nombre = %s, exterior_accesibilidad = %s WHERE id_tipos = %s", (nombre, exterior_accesibilidad, access_id))
        conn.commit()
        return jsonify({"success": True}), 200

    except mysql.connector.Error as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# Ruta donde se elimina un acceso por su ID
@app.route('/delete_access/<int:access_id>', methods=['DELETE'])
@login_required
@super_admin_required
def delete_access(access_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Verificar si el acceso existe antes de eliminar
        cursor.execute("SELECT id_tipos FROM tipos_accesibilidad WHERE id_tipos = %s", (access_id,))
        if not cursor.fetchone():
            return jsonify({"success": False, "error": "Acceso no encontrado"}), 404

        # Intentar eliminar de tipos_accesibilidad
        cursor.execute("DELETE FROM tipos_accesibilidad WHERE id_tipos = %s", (access_id,))
        conn.commit()
        return jsonify({"success": True}), 200

    except mysql.connector.Error as e:
        print(f"Error de base de datos: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

    finally:
        cursor.close()
        conn.close()

@app.route('/check_access_usage/<int:access_id>', methods=['GET'])
@login_required
@super_admin_required
def check_access_usage(access_id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Verificar si el tipo de accesibilidad está asociado a algún edificio
        cursor.execute("SELECT COUNT(*) FROM edificios_accesibilidad WHERE tipo_accesibilidad_id = %s", (access_id,))
        count = cursor.fetchone()[0]

        return jsonify({"in_use": count > 0}), 200

    except mysql.connector.Error as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/get_lineas_user', methods=['GET'])
def get_lineas_user():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Consulta SQL con JOIN para las líneas
        query_lineas = """
            SELECT 
                am.id_accesibilidad_mapa,
                am.descripcion,
                am.color_line,
                am.latitud_inicio,
                am.longitud_inicio,
                am.latitud_final,
                am.longitud_final,
                ta.id_tipos,
                ta.nombre,
                ta.exterior_accesibilidad
            FROM accesibilidades_mapa am
            JOIN tipos_accesibilidad ta
            ON am.tipo_accesibilidad_id = ta.id_tipos
            WHERE ta.exterior_accesibilidad = TRUE
        """
        cursor.execute(query_lineas)
        lineas = cursor.fetchall()

        # Enviar ambos resultados en un solo JSON
        return jsonify({
            'lineas': lineas,
        }), 200

    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.route('/get_lineas', methods=['GET'])
@login_required
def get_lineas():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Consulta SQL con JOIN para las líneas
        query_lineas = """
            SELECT 
                am.id_accesibilidad_mapa,
                am.descripcion,
                am.color_line,
                am.latitud_inicio,
                am.longitud_inicio,
                am.latitud_final,
                am.longitud_final,
                ta.id_tipos,
                ta.nombre,
                ta.exterior_accesibilidad
            FROM accesibilidades_mapa am
            JOIN tipos_accesibilidad ta
            ON am.tipo_accesibilidad_id = ta.id_tipos
            WHERE ta.exterior_accesibilidad = TRUE
        """
        cursor.execute(query_lineas)
        lineas = cursor.fetchall()

        # Consulta para obtener todos los tipos de accesibilidad donde exterior_accesibilidad es TRUE
        query_tipos = """
            SELECT id_tipos, nombre
            FROM tipos_accesibilidad
            WHERE exterior_accesibilidad = TRUE
        """
        cursor.execute(query_tipos)
        tipos_accesibilidad = cursor.fetchall()

        # Enviar ambos resultados en un solo JSON
        return jsonify({
            'lineas': lineas,
            'tipos_accesibilidad': tipos_accesibilidad
        }), 200

    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route('/get_linea/<int:id>', methods=['GET'])
@login_required
def get_linea(id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM accesibilidades_mapa WHERE id_accesibilidad_mapa = %s", (id,))
        data = cursor.fetchone()
        if data:
            return jsonify(data)
        else:
            return jsonify({"error": "Línea no encontrada"}), 404
    finally:
        cursor.close()
        conn.close()

@app.route('/add_marca_accesibilidad', methods=['POST'])
@login_required
def add_marca_accesibilidad():
    data = request.get_json()

    # Campos del formulario
    descripcion = data['descripcion']
    color_line = data['color_line']
    latitud_inicio = data['latitud_inicio']
    longitud_inicio = data['longitud_inicio']
    latitud_final = data['latitud_final']
    longitud_final = data['longitud_final']
    tipo_accesibilidad_id = data['tipo_accesibilidad_id']

    # Obtener conexión a la base de datos   
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    try:
        # Insertar la marca de accesibilidad con los nuevos campos
        cursor.execute("""
            INSERT INTO accesibilidades_mapa (descripcion, color_line, latitud_inicio, longitud_inicio, latitud_final, longitud_final, tipo_accesibilidad_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (descripcion, color_line, latitud_inicio, longitud_inicio, latitud_final, longitud_final, tipo_accesibilidad_id))
        
        conn.commit()
        return jsonify(success=True)
    
    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Error general: {str(e)}"}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/edit_marca_accesibilidad/<int:id>', methods=['PUT'])  
@login_required 
def edit_marca_accesibilidad(id):
    data = request.get_json()

    # Campos del formulario
    descripcion = data['descripcion']
    color_line = data['color_line']
    latitud_inicio = data['latitud_inicio']
    longitud_inicio = data['longitud_inicio']
    latitud_final = data['latitud_final']
    longitud_final = data['longitud_final']
    tipo_accesibilidad_id = data['tipo_accesibilidad_id']

    # Conexión con la base de datos
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    try:
        # Actualizar los datos de la marca de accesibilidad
        cursor.execute("""
            UPDATE accesibilidades_mapa
            SET descripcion = %s, color_line = %s, latitud_inicio = %s, longitud_inicio = %s, latitud_final = %s, longitud_final = %s, tipo_accesibilidad_id = %s
            WHERE id_accesibilidad_mapa = %s
        """, (descripcion, color_line, latitud_inicio, longitud_inicio, latitud_final, longitud_final, tipo_accesibilidad_id, id))

        conn.commit()
        return jsonify(success=True)

    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Error general: {str(e)}"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/delete_marca_accesibilidad/<int:id>', methods=['DELETE'])
@login_required
def delete_marca_accesibilidad(id):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Eliminar la marca de accesibilidad
        cursor.execute("DELETE FROM accesibilidades_mapa WHERE id_accesibilidad_mapa = %s", (id,))
        
        conn.commit()
        return jsonify(success=True)

    except mysql.connector.Error as e:
        return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
    finally:
        cursor.close()
        conn.close()
        



if __name__ == '__main__':
    app.run(debug=True)
