
[![92C08093-CA7B-463E-8BE3-9F03C6622BD6_klein](https://github.com/user-attachments/assets/7716fdb4-b872-445b-ae45-9caabe0a44a3)](## "generated using a public AI image generator")

# Optimierung der Verwendung des Hausspeichers im Zusammenspiel von Node-RED, evcc und einem dynamischen Stromtarif

## Funktionsweise

Der Batteriespeicher wird bevorzugt mit überschüssigem PV-Strom geladen. Eine Entladung in Zeiten günstigen Netzstroms wird vermieden. Ist die Preisdifferenz ausreichend hoch (z. B. > 15 ct/kWh), kann eine Netzladung zum günstigsten Zeitpunkt des Tages erfolgen, um die Batterie bis zu 80 % zu laden. Der Netzladungspreis wird bei der weiteren Steuerung berücksichtigt: Die Batterie gibt Energie nur frei, wenn der Netzstrompreis deutlich über dem Netzladungspreis liegt (~130 %). 

Um ein ineffizientes Laden und Entladen zu vermeiden, wird die Batterie erst bei einem Ladestand unter 30 % geladen. Die Steuerung fokussiert sich auf die Verschiebung der Energienutzung und die Optimierung des Speichereinsatzes. 

Die Schwellenwerte für Netzladung sind konfigurierbar und standardmäßig hoch eingestellt, da eine Netzladung oft nicht wirtschaftlich ist. Wenn für den Folgetag eine ausreichende PV-Erzeugung für die teuren Strompreiszeiten prognostiziert wird, erfolgt keine Netzladung.

## Einflussgrößen

Die optimierte Steuerung ist nur aktiv, wenn die prognostizierte tägliche PV-Erzeugung unter dem Tagesstrombedarf liegt (PV-Prognose < 17,5 kWh). Die Prognosedaten können von [SOLCAST](https://solcast.com/free-rooftop-solar-forecasting) über eine persönliche Home-Use-API bezogen werden. Im Tagesverlauf wird der verbleibende PV-Ertrag dynamisch in die Steuerung einbezogen.

Ein vordefiniertes Standardlastprofil für einen 4-Personen-Haushalt mit berufstätigen Eltern und Schulkindern (ca. 15 kWh/Tag) wird genutzt. Der Verbrauch wird von der aktuellen Stunde bis zum nächsten Morgen (8 Uhr) unter Berücksichtigung des stündlichen Bedarfs berechnet.

Wenn Strompreise für den aktuellen und den kommenden Tag verfügbar sind, fließen diese in die Optimierung ein. Die Preise können über [evcc](https://evcc.io/) per HTTP-API oder alternativ von der Fraunhofer ISE [Energy-Charts](https://www.energy-charts.info/) bezogen werden.

## Steuerung des Batteriespeichers

Die Berechnung ermittelt den optimalen Batteriemodus. Die eigentliche Steuerung eines (hybriden) Wechselrichters ist aufgrund hardwareabhängiger Faktoren separat zu implementieren:

- Eine Netzladung kann über die Übergabe des Netzladungspreises an eine [evcc](https://evcc.io/) Instanz per MQTT/HTTP-API gesteuert werden.
- Eine Batteriesperre kann, wenn evcc dies unterstützt, basierend auf den Informationen aus dem [evcc-Wiki](https://github.com/evcc-io/evcc/wiki/aaa-Lifehacks#entladung-eines-steuerbaren-hausspeicher-preisgesteuert-oder-manuell-sperren) realisiert werden. Dabei kann entweder der ermittelte Preis direkt genutzt oder der Modus per MQTT/HTTP-API gesteuert werden (Lade-/Entlademodus).

## Node-RED-Integration

Das Node-RED-Paket enthält verschiedene Nodes zur Optimierung der Batterienutzung, darunter:
- Bestimmung des Batteriemodus
- Bewertung von Solarprognosen
- Steuerung des Batteriemodus

Die Nodes sind flexibel nutzbar und können mit externen Datenquellen kombiniert werden. Es besteht die Möglichkeit, eigene Nodes für zusätzliche Datenquellen zu integrieren. So kann die Lösung mit oder ohne evcc betrieben werden. Die Nodes sind mit Standardwerten vorkonfiguriert, wobei die Nachrichteneingänge eine Konfigurationsanpassung ermöglichen. Das modulare Design erleichtert die Wiederverwendung und Anpassung an unterschiedliche Installationen.

Eine externe Steuerung kann eingebunden werden, die weiterhin den Status der evcc-Laderegelung und aktuelle Energiewerte berücksichtigt.

## Einsatz und Weiterentwicklung

Ich setze die npm-Bausteine innerhalb einer Node-RED-Instanz auf ioBroker ein. Sie sollten jedoch auch mit anderen Plattformen wie Home Assistant kompatibel sein.

Eine Veröffentlichung des Pakets ist inzwischen erfolgt, weitere Erfahrungswerte und Optimierungen sind nötig.

---

*Bereitgestellt ohne Gewähr. Der Einsatz der bereitgestellten Inhalte erfolgt in eigener Verantwortung!*


<h1>@iseeberg79/battery-usage-optimization-nodes</h1>
<h2>Einführung</h2>

Flowbeispiel

![image](https://github.com/user-attachments/assets/90dec152-1f59-4d89-aa5f-c28893201788)


Kontextdaten des Flows

![image](https://github.com/user-attachments/assets/68014f67-9ed2-49fe-8f56-b0fb2f8dc44f)


<h2>Installation</h2>


Zum Beispiel als Upload im Palettenmanager von node-red in ioBroker, bzw.:

npm install @iseeberg79/battery-usage-optimization-nodes


![image](https://github.com/user-attachments/assets/9afcea44-369a-4fdb-aa09-dfb67c39c39e)

![image](https://github.com/user-attachments/assets/3f2a643e-9f1b-456b-8e06-8c512cbb9ee5)

![image](https://github.com/user-attachments/assets/2c84af6d-33d7-43c3-afb8-75ec90aca0e8)



<h2>Links</h2>

[evcc](https://evcc.io) 

[solcast](https://solcast.com.au) 

[Energy-Charts](https://www.energy-charts.info/)

[iobroker.net](https://www.iobroker.net) 

[node-red](https://nodered.org) 


