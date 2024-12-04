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
    tipo_edificio = data['tipo_edificio']  # Tipo de edificio seleccionado
    tipo_accesibilidad = data['accesibilidad']  # Lista de accesibilidades seleccionadas

    # Obtener el id del tipo de edificio desde la base de datos
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    try:
        # Insertar el edificio con los nuevos campos
        cursor.execute("""
            INSERT INTO edificios (nombre, direccion, imagen_url, tipo_edificio, horario_inicio, horario_final, sitioweb, latitud, longitud)
            VALUES (%s, %s, %s, (SELECT id_tipos_edificios FROM tipos_edificios WHERE nombre_tipo = %s), %s, %s, %s, %s, %s)
        """, (nombre, direccion, imagen_url, tipo_edificio, horario_inicio, horario_final, sitioweb, latitud, longitud))
        
        edificio_id = cursor.lastrowid  # Obtener el ID del edificio recién agregado

        # Insertar cada tipo de accesibilidad individualmente
        for tipo in tipo_accesibilidad:
            cursor.execute("""
                INSERT INTO edificios_accesibilidad (edificio_id, tipo_accesibilidad_id)
                VALUES (%s, (SELECT id_tipos FROM tipos_accesibilidad WHERE nombre = %s))
            """, (edificio_id, tipo))
        
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
    sitioweb = data.get('sitioweb')
    latitud = data['latitud']
    longitud = data['longitud']
    tipo_edificio_nombre = data['tipo_edificio']  # Recibimos el nombre del tipo de edificio
    tipo_accesibilidad = data['tipo_accesibilidad']  # Lista de IDs de accesibilidad

    # Conexión con la base de datos
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    try:
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
                VALUES (%s, (SELECT id_tipos FROM tipos_accesibilidad WHERE nombre = %s))
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

# Ruta donde agrega el admin a la base de datos
@app.route('/add_admin', methods=['POST'])
@login_required
@super_admin_required
def add_admin():
    nombre = request.form['nombre']
    email = request.form['email']
    password = request.form['password']

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
            VALUES (%s, %s, %s, %s, 2, TRUE)
        """, (nombre, email, password_hash, password_salt))

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
            WHERE rol_id = 2  
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
                SET nombre_usuario = %s, correo = %s, password_hash = %s
                WHERE id_admin = %s
            """, (nombre, email, hashed_password, admin_id))
        else:
            cursor.execute("""
                UPDATE usuario_admin
                SET nombre_usuario = %s, correo = %s
                WHERE id_admin = %s
            """, (nombre, email, admin_id))

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




if __name__ == '__main__':
    app.run(debug=True)
