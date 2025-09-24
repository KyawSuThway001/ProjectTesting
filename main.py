import os
import secrets
from dotenv import load_dotenv
from flask import Flask, render_template, request, redirect, url_for, flash, make_response, jsonify, Response
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from openai import OpenAI

# ----------------------
# Load .env
# ----------------------
load_dotenv()

# ----------------------
# Flask setup
# ----------------------
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY")
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("DATABASE_URL")
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB limit

# 🔒 Cookie security
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True  # set True if using HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = "Strict"

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"

# ----------------------
# Models
# ----------------------
class Login_Info(UserMixin, db.Model):
    __tablename__ = "login_info"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    device_token = db.Column(db.String(200), nullable=True)
    images = db.relationship("Image", backref="user", lazy=True)

class Image(db.Model):
    __tablename__ = "image"
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(200), nullable=False)
    data = db.Column(db.LargeBinary, nullable=False)   # 🖼️ Store file as BLOB
    mimetype = db.Column(db.String(50), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("login_info.id"), nullable=False)

# ----------------------
# User loader
# ----------------------
@login_manager.user_loader
def load_user(user_id):
    return Login_Info.query.get(int(user_id))

# ----------------------
# Utility
# ----------------------
def generate_device_token():
    return secrets.token_urlsafe(32)

# ----------------------
# Auth routes
# ----------------------
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user_email = request.form.get("email")
        password = request.form.get("password")

        user = Login_Info.query.filter_by(email=user_email).first()
        if not user:
            flash("Email not found.")
            return redirect(url_for("login"))

        if not check_password_hash(user.password, password):
            flash("Password incorrect.")
            return redirect(url_for("login"))

        # Device restriction
        device_cookie = request.cookies.get("device_token")
        if user.device_token:
            if device_cookie != user.device_token:
                flash("Access denied: This account is tied to a different device.")
                return redirect(url_for("login"))
        else:
            token = generate_device_token()
            user.device_token = token
            db.session.commit()
            device_cookie = token

        login_user(user)

        resp = make_response(redirect(url_for("index")))
        resp.set_cookie(
            "device_token",
            device_cookie,
            max_age=60 * 60 * 24 * 365,  # 1 year
            httponly=True,
            samesite="Strict",
            secure=True
        )
        return resp

    return render_template("login.html")


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been logged out.")
    return redirect(url_for("login"))


@app.route("/reset_device/<int:user_id>")
def reset_device(user_id):
    """Reset a user's device token (admin use only)."""
    user = Login_Info.query.get(user_id)
    if user:
        user.device_token = None
        db.session.commit()
        flash(f"Device token for {user.email} has been reset.")
    else:
        flash("User not found.")
    return redirect(url_for("login"))


@app.route("/create_users")
def create_users():
    """Run once to create allowed users"""
    emails = ["user1.com", "user2.com", "user3.com"]
    passwords = ["pass1", "pass2", "pass3"]

    for email, pwd in zip(emails, passwords):
        if not Login_Info.query.filter_by(email=email).first():
            user = Login_Info(
                email=email,
                password=generate_password_hash(pwd, method="pbkdf2:sha256", salt_length=8),
            )
            db.session.add(user)
    db.session.commit()
    return "Users created. Disable this route after first run!"

# ----------------------
# Image routes
# ----------------------
@app.route("/")
@login_required
def index():
    images = Image.query.filter_by(user_id=current_user.id).all()
    return render_template("index.html", images=images)

@app.route("/upload", methods=["POST"])
@login_required
def upload():
    if "image" not in request.files:
        return "No file selected", 400

    file = request.files["image"]
    if file.filename == "":
        return "No filename", 400

    filename = secure_filename(file.filename)
    mimetype = file.mimetype
    if not mimetype:
        return "Bad upload", 400

    new_image = Image(filename=filename, data=file.read(), mimetype=mimetype, user_id=current_user.id)
    db.session.add(new_image)
    db.session.commit()

    return redirect(url_for("index"))

@app.route("/delete/<int:image_id>", methods=["POST"])
@login_required
def delete(image_id):
    image = Image.query.get_or_404(image_id)

    if image.user_id != current_user.id:
        flash("Not authorized to delete this image.")
        return redirect(url_for("index"))

    db.session.delete(image)
    db.session.commit()
    return redirect(url_for("index"))

@app.route("/image/<int:image_id>")
@login_required
def get_image(image_id):
    image = Image.query.get_or_404(image_id)
    return Response(image.data, mimetype=image.mimetype)

# ----------------------
# AI Chat
# ----------------------
@app.route("/ask", methods=["POST"])
@login_required
def ask():
    data = request.get_json()
    question = data.get("question", "")

    if not question.strip():
        return jsonify({"answer": "Please enter a question."})

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": question}]
        )
        answer = response.choices[0].message.content
        return jsonify({"answer": answer})
    except Exception as e:
        return jsonify({"answer": f"Error: {str(e)}"})

# ----------------------
# Run app
# ----------------------
if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)
