from pathlib import Path
import textwrap
import zlib


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "guion_presentacion_radar_digital.pdf"


sections = [
    ("Guion de presentacion", [
        "Radar digital de negocios locales",
        "Version clara para exponer en clase, con frases profesionales para reforzar la presentacion.",
    ]),
    ("1. Introduccion", [
        "Nuestra aplicacion funciona como un radar digital de negocios locales. Analiza comercios de una zona, los compara con negocios cercanos del mismo sector y detecta cuales tienen mas margen de mejora.",
        "La idea principal es convertir informacion dispersa sobre negocios locales en un panel visual y facil de entender.",
        "Frase para decir: La aplicacion transforma datos de negocios locales en un sistema de apoyo a la decision, ayudando a priorizar acciones de digitalizacion con informacion real.",
    ]),
    ("2. Problema que resuelve", [
        "Muchos negocios locales tienen presencia digital incompleta. Algunos no tienen pagina web, otros tienen poca informacion en su ficha, pocas reseñas o comentarios negativos que afectan a su reputacion.",
        "El problema es que normalmente estos negocios no saben que deben mejorar primero ni como estan posicionados frente a otros comercios cercanos.",
        "Preguntas que responde: que negocios necesitan mejorar, que comercios tienen mayor brecha, donde se concentran las oportunidades y que acciones deberia priorizar cada negocio.",
    ]),
    ("3. Solucion propuesta", [
        "La solucion es una aplicacion web que analiza negocios locales, calcula un score digital y compara cada negocio con su entorno competitivo.",
        "El sistema permite ver una vision general del mercado local y despues entrar en la ficha concreta de cada comercio.",
        "Frase para explicar: No solo mostramos datos aislados. La aplicacion los organiza, los compara y los convierte en recomendaciones concretas para mejorar.",
    ]),
    ("4. Pantalla principal", [
        "En la pantalla principal aparece el panel general del radar digital. Esta vista muestra barrios activos, numero total de negocios analizados, score medio y brecha media digital.",
        "Tambien incluye filtros para buscar por nombre, barrio, sector, subsector, comentarios, existencia de web y score minimo.",
        "Frase para decir: Esta pantalla funciona como un mapa de oportunidades. Permite identificar que negocios tienen mas margen de mejora y donde estan ubicados.",
    ]),
    ("5. Mapa de oportunidades", [
        "El mapa muestra los negocios geolocalizados. Gracias a esta vista se puede entender la distribucion territorial de los comercios y detectar zonas donde hay mas brecha digital.",
        "A la derecha aparece el listado de top oportunidades, donde se destacan los negocios que tienen bajo score o una diferencia importante respecto a sus competidores.",
        "Frase para explicar: El mapa permite pasar de una vision general a una priorizacion territorial. No solo sabemos que negocio necesita ayuda, sino tambien en que zona esta y contra quien compite.",
    ]),
    ("6. Ficha sin comentarios", [
        "En la ficha de un negocio concreto, como Nevada, se muestra el analisis individual del comercio.",
        "La pantalla incluye score general, comparacion con la media del barrio, comparacion con negocios mejor posicionados, ubicacion, competidores cercanos y acciones recomendadas.",
        "Tambien aparece un desglose del score en presencia digital, operacion y servicio, identidad y confianza, y completitud de ficha.",
        "Frase para decir: La ficha individual transforma el score en un diagnostico claro. No se limita a decir si el negocio esta bien o mal, sino que muestra en que aspectos concretos debe mejorar.",
    ]),
    ("7. Ficha con comentarios", [
        "La tercera captura muestra una ficha mas completa, porque el negocio tiene comentarios detectados. El ejemplo es Centro Dental Roquetas.",
        "En este caso la aplicacion no solo analiza la presencia digital, sino tambien la percepcion real de los clientes.",
        "Esta pantalla muestra score general, gap frente a la competencia, numero de reseñas, estado de la web, percentil local, media del barrio, top cuartil, competidores cercanos, comentarios detectados y analisis generado por IA.",
        "Frase para explicar: Cuando existen comentarios de clientes, la aplicacion añade una capa de analisis cualitativo. Esto permite interpretar no solo los numeros, sino tambien la experiencia real de los usuarios.",
    ]),
    ("8. Comentarios detectados", [
        "El bloque de comentarios detectados recoge opiniones relevantes de los clientes. Esta parte es importante porque permite descubrir problemas que no siempre aparecen en las metricas numericas.",
        "Por ejemplo, un negocio puede tener una ficha bastante completa, pero recibir comentarios negativos sobre trato al cliente, falta de profesionalidad, mala atencion o problemas repetidos en el servicio.",
        "Frase para decir: Los comentarios permiten incorporar la voz del cliente al analisis. Asi, el diagnostico no depende solo de datos como la web o las reseñas, sino tambien de lo que realmente opinan los usuarios.",
    ]),
    ("9. Analisis con IA", [
        "La seccion de analisis IA resume los comentarios y los transforma en informacion accionable.",
        "La IA organiza el contenido en resumen ejecutivo, problemas detectados, causas probables, recomendaciones accionables e indicadores para medir si el negocio mejora.",
        "Frase para explicar: La IA ayuda a transformar reseñas y comentarios en informacion accionable. Resume los problemas principales, propone posibles causas y recomienda acciones concretas para mejorar.",
    ]),
    ("10. Diferencia entre fichas", [
        "La aplicacion se adapta a la informacion disponible.",
        "Cuando no hay comentarios, el analisis se centra en la huella digital del negocio: web, ficha, presencia online, score y comparacion con competidores.",
        "Cuando si hay comentarios, se añade una capa extra de analisis reputacional. Esto permite evaluar la experiencia del cliente y detectar problemas cualitativos.",
        "Resumen: ficha sin comentarios analiza presencia digital, ficha, web y competencia cercana. Ficha con comentarios analiza todo lo anterior y ademas incorpora reputacion, experiencia del cliente e interpretacion con IA.",
    ]),
    ("11. Valor del proyecto", [
        "El valor principal de la aplicacion es que ayuda a tomar decisiones basadas en datos.",
        "Puede ser util para comercios locales, ayuntamientos, asociaciones de comerciantes, consultores, agencias de marketing, camaras de comercio y programas de digitalizacion local.",
        "Beneficios: prioriza negocios con mayor necesidad de mejora, compara cada negocio con competidores cercanos, detecta negocios sin web o con baja presencia digital, analiza comentarios, genera recomendaciones y permite visualizar oportunidades en un mapa.",
        "Frase formal: La aplicacion transforma informacion dispersa sobre negocios locales en un sistema de apoyo a la decision, util para priorizar acciones de digitalizacion y mejorar la competitividad del comercio local.",
    ]),
    ("12. Guion final para exponer", [
        "Nuestra aplicacion funciona como un radar digital de negocios locales. Analiza comercios de una zona, los compara con negocios cercanos del mismo sector y detecta cuales tienen mas margen de mejora.",
        "En la pantalla principal podemos ver una vision general con barrios activos, negocios analizados, score medio y brecha digital. Tambien podemos aplicar filtros por barrio, sector, comentarios, web o puntuacion minima.",
        "El mapa de oportunidades permite localizar visualmente los negocios que necesitan mas ayuda. A la derecha aparecen las principales oportunidades, que son los comercios con peor posicionamiento o mayor diferencia frente a la competencia.",
        "Cuando entramos en una ficha concreta, la aplicacion muestra el score del negocio, su comparacion con el barrio, sus competidores cercanos y un desglose por areas como presencia digital, operacion y servicio, identidad y completitud de ficha.",
        "En los negocios que tienen comentarios, la aplicacion añade una parte mas avanzada. Analiza las opiniones de los clientes con inteligencia artificial, detecta problemas principales, propone posibles causas y recomienda acciones concretas.",
        "Por tanto, la app no solo muestra datos, sino que los convierte en un diagnostico util. Puede ayudar a comercios, ayuntamientos, asociaciones o consultores a decidir que negocios necesitan apoyo y que mejoras deberian priorizar.",
        "En resumen, es una herramienta para detectar brecha digital, comparar competencia cercana y generar recomendaciones accionables para mejorar la presencia digital y la reputacion de los negocios locales.",
    ]),
]


def pdf_escape(text):
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def line_width(text, font_size):
    # Approximation good enough for standard Helvetica text wrapping.
    return len(text) * font_size * 0.48


def wrap(text, max_width, font_size):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and line_width(candidate, font_size) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def build_pages():
    width, height = 595, 842
    margin = 54
    max_width = width - (margin * 2)
    pages = []
    ops = []
    y = height - margin

    def new_page():
        nonlocal ops, y
        if ops:
            pages.append("\n".join(ops))
        ops = []
        y = height - margin
        ops.append("0.965 0.945 0.900 rg 0 0 595 842 re f")
        ops.append("0.06 0.43 0.43 RG 54 806 m 541 806 l S")

    def add_text(text, size=11, bold=False, color="body", leading=None):
        nonlocal y
        if leading is None:
            leading = size + 5
        font = "F2" if bold else "F1"
        if color == "title":
            rgb = "0.07 0.15 0.14"
        elif color == "accent":
            rgb = "0.00 0.42 0.43"
        else:
            rgb = "0.15 0.17 0.18"
        for line in wrap(text, max_width, size):
            if y < margin + leading:
                new_page()
            ops.append(f"BT /{font} {size} Tf {rgb} rg {margin} {y:.2f} Td ({pdf_escape(line)}) Tj ET")
            y -= leading

    def add_space(amount):
        nonlocal y
        y -= amount
        if y < margin:
            new_page()

    new_page()
    for title, paragraphs in sections:
        if y < 150:
            new_page()
        if title == "Guion de presentacion":
            add_text(title, size=24, bold=True, color="title", leading=30)
            add_text(paragraphs[0], size=18, bold=True, color="accent", leading=24)
            add_space(8)
            add_text(paragraphs[1], size=12, color="body", leading=18)
            add_space(18)
            continue
        add_text(title, size=15, bold=True, color="accent", leading=21)
        add_space(2)
        for paragraph in paragraphs:
            add_text(paragraph, size=10.5, color="body", leading=15.5)
            add_space(5)
        add_space(6)
    pages.append("\n".join(ops))
    return pages


def make_pdf(pages):
    objects = []

    def add_obj(content):
        objects.append(content)
        return len(objects)

    catalog_id = add_obj("<< /Type /Catalog /Pages 2 0 R >>")
    pages_id = add_obj("")
    font_regular_id = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    font_bold_id = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
    page_ids = []

    for page in pages:
        stream = page.encode("latin-1", errors="replace")
        compressed = zlib.compress(stream)
        content_id = add_obj(b"<< /Length " + str(len(compressed)).encode("ascii") + b" /Filter /FlateDecode >>\nstream\n" + compressed + b"\nendstream")
        page_id = add_obj(f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> /Contents {content_id} 0 R >>")
        page_ids.append(page_id)

    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{' '.join(f'{pid} 0 R' for pid in page_ids)}] /Count {len(page_ids)} >>"

    body = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(body))
        body.extend(f"{i} 0 obj\n".encode("ascii"))
        if isinstance(obj, bytes):
            body.extend(obj)
        else:
            body.extend(obj.encode("latin-1", errors="replace"))
        body.extend(b"\nendobj\n")

    xref_pos = len(body)
    body.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    body.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        body.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    body.extend(f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii"))
    OUTPUT.write_bytes(body)


if __name__ == "__main__":
    make_pdf(build_pages())
    print(OUTPUT)
