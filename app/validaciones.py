import re
import unicodedata
from datetime import date, datetime

_ESPACIOS = re.compile(r"\s+")
_CORREO = re.compile(
    r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$"
)
_TELEFONO = re.compile(r"^[0-9]{8}$")
_DPI = re.compile(r"^[0-9]{13}$")


# ===================================================================
# TEXTO
# ===================================================================
def limpiar_texto(valor, obligatorio: bool = True, campo: str = "El campo") -> str | None:
    texto = _ESPACIOS.sub(" ", str(valor or "")).strip()
    if not texto:
        if obligatorio:
            raise ValueError(f"{campo} es obligatorio")
        return None
    return texto


def normalizar(valor) -> str:
    texto = _ESPACIOS.sub(" ", str(valor or "")).strip().casefold()
    texto = texto.replace("ñ", "\x00")
    texto = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    return texto.replace("\x00", "ñ")


def normalizar_codigo(valor) -> str:
    return _ESPACIOS.sub("", str(valor or "")).upper()


# ===================================================================
# DATOS DE PERSONAS
# ===================================================================
def validar_correo(valor, obligatorio: bool = False) -> str | None:
    texto = limpiar_texto(valor, obligatorio, campo="El correo")
    if texto is None:
        return None
    texto = texto.lower()
    if " " in texto or ".." in texto or not _CORREO.match(texto):
        raise ValueError("El correo no tiene un formato válido (ejemplo: nombre@gmail.com)")
    return texto


def validar_telefono(valor, obligatorio: bool = False) -> str | None:
    """Exactamente 8 dígitos. Acepta '12345678', '1234-5678' o '1234 5678' y guarda '1234-5678'."""
    texto = limpiar_texto(valor, obligatorio, campo="El teléfono")
    if texto is None:
        return None
    digitos = re.sub(r"[\s\-]", "", texto)
    if not _TELEFONO.match(digitos):
        raise ValueError("El teléfono debe tener exactamente 8 dígitos, sin letras")
    return f"{digitos[:4]}-{digitos[4:]}"


MUNICIPIOS_POR_DEPARTAMENTO = [
    17,  # 01 Guatemala
    8,   # 02 El Progreso
    16,  # 03 Sacatepéquez
    16,  # 04 Chimaltenango
    14,  # 05 Escuintla
    14,  # 06 Santa Rosa
    19,  # 07 Sololá
    8,   # 08 Totonicapán
    24,  # 09 Quetzaltenango
    21,  # 10 Suchitepéquez
    9,   # 11 Retalhuleu
    30,  # 12 San Marcos
    33,  # 13 Huehuetenango
    21,  # 14 Quiché
    8,   # 15 Baja Verapaz
    17,  # 16 Alta Verapaz
    14,  # 17 Petén
    5,   # 18 Izabal
    11,  # 19 Zacapa
    11,  # 20 Chiquimula
    7,   # 21 Jalapa
    17,  # 22 Jutiapa
]


def validar_dpi(valor, obligatorio: bool = True, validar_digito: bool = False) -> str | None:
    texto = limpiar_texto(valor, obligatorio, campo="El DPI")
    if texto is None:
        return None
    dpi = re.sub(r"[\s\-]", "", texto)
    if not _DPI.match(dpi):
        raise ValueError("El DPI debe tener exactamente 13 dígitos")

    departamento = int(dpi[9:11])
    municipio = int(dpi[11:13])
    if not 1 <= departamento <= len(MUNICIPIOS_POR_DEPARTAMENTO):
        raise ValueError("El DPI tiene un código de departamento que no existe")
    if not 1 <= municipio <= MUNICIPIOS_POR_DEPARTAMENTO[departamento - 1]:
        raise ValueError("El DPI tiene un código de municipio que no existe en ese departamento")

    if validar_digito:
        total = sum(int(d) * (i + 2) for i, d in enumerate(dpi[:8]))
        if total % 11 != int(dpi[8]):
            raise ValueError("El DPI no es válido (el dígito verificador no coincide)")
    return dpi


# ===================================================================
# NIT
# ===================================================================
CONSUMIDOR_FINAL = "CF"

def limpiar_nit(valor) -> str:
    """No valida formato. Vacío se toma como 'CF'. Se guarda en mayúsculas y sin espacios."""
    texto = _ESPACIOS.sub("", str(valor or "")).upper()
    return texto or CONSUMIDOR_FINAL


def clave_nit(nit) -> str | None:
    """
    Valor para la columna única 'nit_unico'. 'CF' devuelve None
    (varios NULL están permitidos en un índice único, así CF se puede repetir).
    '1234567-8' y '12345678' cuentan como el mismo NIT.
    """
    limpio = limpiar_nit(nit)
    if limpio in (CONSUMIDOR_FINAL, "C/F", "C.F."):
        return None
    return limpio.replace("-", "")


# ===================================================================
# CONTRASEÑAS
# ===================================================================
def validar_password(password: str, nombre_usuario: str | None = None) -> str:
    if not password or len(password) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("La contraseña es demasiado larga (máximo 72 caracteres)")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        raise ValueError("La contraseña debe tener al menos una letra y un número")
    if nombre_usuario and password.casefold() == nombre_usuario.strip().casefold():
        raise ValueError("La contraseña no puede ser igual al nombre de usuario")
    return password


# ===================================================================
# FECHAS
# ===================================================================
def validar_rango_fechas(desde: date | datetime | None, hasta: date | datetime | None) -> None:
    if desde and hasta and desde > hasta:
        raise ValueError("La fecha 'Desde' no puede ser mayor que la fecha 'Hasta'")