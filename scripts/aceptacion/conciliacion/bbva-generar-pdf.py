#!/usr/bin/env python3
"""Genera un PDF BBVA México SINTÉTICO y anonimizado con posiciones reales.

No contiene datos de ningún contribuyente: RFC, cuenta y conceptos son ficticios.
Salida: scripts/aceptacion/conciliacion/salida/bbva_sintetico.pdf
"""
import json
import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

SALIDA = os.path.join(os.path.dirname(__file__), "salida")
os.makedirs(SALIDA, exist_ok=True)
PDF = os.path.join(SALIDA, "bbva_sintetico.pdf")

X = {"oper": 40, "liq": 82, "desc": 120, "cargo": 400, "abono": 470, "saldo": 545}

FILAS = [
    ("30/DIC", "SPEI ENVIADO STP BANCO DEMO", "REFERENCIA 0066398014 CUENTA 0123", 19800.00, 0),
    ("30/DIC", "SPEI ENVIADO SUSCRIPCION DIGITAL", None, 28700.00, 0),
    ("31/DIC", "PAGO CUENTA DE TERCERO", None, 1049.00, 0),
    ("02/ENE", "RETIRO CAJERO AUTOMATICO", None, 2000.00, 0),
    ("05/ENE", "SPEI RECIBIDO CLIENTE FACTURA", None, 0, 45000.00),
    ("10/ENE", "DEPOSITO EN EFECTIVO SUCURSAL", None, 0, 7250.50),
    ("15/ENE", "COMISION MANEJO DE CUENTA", None, 350.00, 0),
]

SALDO_INICIAL = 100000.00


def money(v):
    return f"{v:,.2f}"


def right(c, texto, centro_x, y):
    ancho = c.stringWidth(texto, "Helvetica", 8)
    c.drawString(centro_x - ancho / 2, y, texto)


def encabezado(c, y):
    c.setFont("Helvetica-Bold", 8)
    c.drawString(X["oper"], y, "OPER")
    c.drawString(X["liq"], y, "LIQ")
    c.drawString(X["desc"], y, "COD. DESCRIPCION / REFERENCIA")
    right(c, "CARGOS", X["cargo"], y)
    right(c, "ABONOS", X["abono"], y)
    right(c, "SALDO", X["saldo"], y)
    c.setFont("Helvetica", 8)


def main():
    c = canvas.Canvas(PDF, pagesize=letter)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, 750, "BBVA MEXICO S.A.  ESTADO DE CUENTA")
    c.setFont("Helvetica", 8)
    c.drawString(40, 736, "CLIENTE DEMOSTRACION SA DE CV   RFC DEMO010101AA1")
    c.drawString(40, 724, "No. de Cuenta 0000000000   CLABE 012000000000000000")
    c.drawString(40, 712, "Periodo DEL 26/12/2025 AL 25/01/2026")

    y = 690
    encabezado(c, y)
    y -= 16

    saldo = SALDO_INICIAL
    esperado = []
    for i, (oper, desc, desc2, cargo, abono) in enumerate(FILAS):
        if i == 4:  # corte de página con encabezado repetido
            c.showPage()
            c.setFont("Helvetica-Bold", 10)
            c.drawString(40, 750, "BBVA MEXICO S.A.  Pagina 2 de 2")
            c.setFont("Helvetica", 8)
            y = 690
            encabezado(c, y)
            y -= 16
        saldo = round(saldo + abono - cargo, 2)
        c.drawString(X["oper"], y, oper)
        c.drawString(X["liq"], y, oper)
        c.drawString(X["desc"], y, desc)
        if cargo:
            right(c, money(cargo), X["cargo"], y)
        if abono:
            right(c, money(abono), X["abono"], y)
        right(c, money(saldo), X["saldo"], y)
        y -= 12
        if desc2:
            c.drawString(X["desc"] + 8, y, desc2)
            y -= 12
        mes = "12" if oper.endswith("DIC") else "01"
        anio = "2025" if mes == "12" else "2026"
        esperado.append({
            "fecha": f"{anio}-{mes}-{oper[:2]}",
            "descripcion": desc,
            "cargo": cargo,
            "abono": abono,
            "saldo": saldo,
        })

    y -= 14
    c.drawString(X["desc"], y, "TOTAL DE CARGOS")
    right(c, money(sum(f[3] for f in FILAS)), X["cargo"], y)
    y -= 12
    c.drawString(X["desc"], y, "TOTAL DE ABONOS")
    right(c, money(sum(f[4] for f in FILAS)), X["abono"], y)
    y -= 12
    c.drawString(X["desc"], y, "SALDO FINAL")
    right(c, money(saldo), X["saldo"], y)
    c.save()

    verdad = {
        "archivo": PDF,
        "periodo": {"inicio": "2025-12-26", "fin": "2026-01-25"},
        "saldo_inicial": SALDO_INICIAL,
        "saldo_final": saldo,
        "cargos": round(sum(f[3] for f in FILAS), 2),
        "abonos": round(sum(f[4] for f in FILAS), 2),
        "movimientos": esperado,
    }
    with open(os.path.join(SALIDA, "bbva_verdad.json"), "w", encoding="utf-8") as fh:
        json.dump(verdad, fh, indent=2, ensure_ascii=False)
    print(json.dumps({"pdf": PDF, "filas": len(esperado)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
