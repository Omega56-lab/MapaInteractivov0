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

load_dotenv()

app = Flask(__name__)

db_config = {
    'host': os.getenv('DB_HOST'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME')
}

API_KEY = os.getenv('API_KEY')
email_sender = os.getenv("EMAIL_SENDER")
email_password = os.getenv("EMAIL_PASSWORD")

app.secret_key = os.getenv('SECRET_KEY') 

@app.route('/')
def home():
    return render_template('user/user.html', api_key=API_KEY)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            abort(404) 
        return f(*args, **kwargs)
    return decorated_function

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
                session['logged_in'] = True
                session['user_id'] = user['id_admin']
                session['user_name'] = user['nombre_usuario']  # Guarda el nombre en la sesión
                return redirect(url_for('index'))
            else:
                error_message = "Credenciales incorrectas. Intenta de nuevo."
                return render_template('login/login.html', error=error_message)  

        except mysql.connector.Error as e:
            return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
        finally:
            cursor.close()
            conn.close()

    # Renderiza la página de login si es una solicitud GET
    return render_template('login/login.html')

def requires_recovery_step(required_step):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if session.get('step') != required_step:
                abort(404)  # Forbidden o redirige a la recuperación
            return f(*args, **kwargs)
        return decorated_function
    return decorator

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

@app.route('/change_password', methods=['GET', 'POST'])
@requires_recovery_step('change')  # Aplicar el decorador
def change_password():
    if request.method == 'POST':
        new_password = request.form['password']
        confirm_password = request.form.get('confirm_password') 

        if new_password == confirm_password:
            try:
                conn = mysql.connector.connect(**db_config)
                cursor = conn.cursor()
                hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
                cursor.execute("UPDATE usuario_admin SET password_hash = %s WHERE correo = %s", (hashed_password, session['correo']))
                conn.commit()

   
                session.pop('verification_code', None)
                session.pop('correo', None)
                session.pop('step', None)
                error_message = 'Contraseña cambiada exitosamente'
                return render_template('login/login.html', error=error_message)
            
            except mysql.connector.Error as e:
                return jsonify({"error": f"Error de base de datos: {str(e)}"}), 500
        
        error_message = "Las contraseñas no coinciden."
        return render_template('login/change_password.html', error=error_message)

    return render_template('login/change_password.html')

@app.route('/admin', methods=['GET', 'POST'])
@login_required  
def index():
    return render_template('admin/admin.html', api_key=API_KEY)  

@app.route('/logout')
def logout():
    session.pop('logged_in', None)  
    return redirect(url_for('home'))  



@app.route('/get_edificios', methods=['GET'])
def get_edificios():
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT e.id_edificios, e.nombre, e.direccion, e.latitud, e.longitud, GROUP_CONCAT(a.nombre SEPARATOR ', ') AS accesibilidad
            FROM edificios e
            LEFT JOIN edificios_accesibilidad ea ON e.id_edificios = ea.edificio_id
            LEFT JOIN tipos_accesibilidad a ON ea.tipo_accesibilidad_id = a.id_tipos
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


# Ruta para obtener tipos de accesibilidad
@app.route('/get_tipos_accesibilidad')
@login_required
def get_tipos_accesibilidad():
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT DISTINCT * FROM tipos_accesibilidad")  # Asegúrate de usar DISTINCT
    tipos = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(tipos)

# Ruta para agregar un nuevo edificio
@app.route('/add_edificio', methods=['POST'])
@login_required
def add_edificio():
    data = request.get_json()
    nombre = data['nombre']
    direccion = data['direccion']
    latitud = data['latitud']
    longitud = data['longitud']
    tipo_accesibilidad = data['tipo_accesibilidad']

    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    try:
        # Insertar el edificio
        cursor.execute("INSERT INTO edificios (nombre, direccion, latitud, longitud) VALUES (%s, %s, %s, %s)", 
                       (nombre, direccion, latitud, longitud))
        edificio_id = cursor.lastrowid  # Obtener el ID del edificio recién agregado

        # Insertar cada tipo de accesibilidad individualmente
        for tipo in tipo_accesibilidad:
            cursor.execute("INSERT INTO edificios_accesibilidad (edificio_id, tipo_accesibilidad_id) VALUES (%s, %s)", 
                           (edificio_id, tipo))
        
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
        

@app.route('/edit_edificio/<int:edificio_id>', methods=['PUT'])
@login_required
def edit_edificio(edificio_id):
    data = request.get_json()
    nombre = data['nombre']
    direccion = data['direccion']
    latitud = data['latitud']
    longitud = data['longitud']
    tipo_accesibilidad = data['tipo_accesibilidad']

    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    # Actualizar el edificio
    cursor.execute("""
        UPDATE edificios 
        SET nombre = %s, direccion = %s, latitud = %s, longitud = %s 
        WHERE id_edificios = %s
    """, (nombre, direccion, latitud, longitud, edificio_id))

    # Eliminar accesibilidades existentes
    cursor.execute("DELETE FROM edificios_accesibilidad WHERE edificio_id = %s", (edificio_id,))
    
    # Insertar nuevas accesibilidades
    for tipo in tipo_accesibilidad:
        cursor.execute("INSERT INTO edificios_accesibilidad (edificio_id, tipo_accesibilidad_id) VALUES (%s, %s)", 
                       (edificio_id, tipo))

    conn.commit()
    cursor.close()
    conn.close()

    return jsonify(success=True)


if __name__ == '__main__':
    app.run(debug=True)
