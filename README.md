[![92C08093-CA7B-463E-8BE3-9F03C6622BD6_klein](https://github.com/user-attachments/assets/7716fdb4-b872-445b-ae45-9caabe0a44a3)](## "generated using a public AI image generator")

<h1>Optimierung der Verwendung des Hausspeichers im Zusammenspiel von ioBroker, node-red, evcc und einem dynamischen Stromtarif</h1>

<h2>Funktionsweise:</h2>
Der Batteriespeicher soll bei überschüssigem PV-Strom geladen, aber nicht in Zeiten günstigen Netzstromes entladen werden. Ist die Preisdifferenz ausreichend hoch (>15ct) wird eine Netzladung zum günstigsten Zeitpunkt des Tages erwogen und die Batterie bis zum Füllstand von 80% geladen. Um die Batterie nicht ungünstig zu entladen, wird der Netzladungspreis bei der weiteren Steuerung der Batteriesperre berücksichtigt, und die Freigabe der Batterie erfolgt nur bei einem Netzstrompreis, der ausreichend über dem Netzladungspreis liegt (~130%). Die Batterie wird außerdem nur geladen, wenn Stand des Batteriespeichers ausreichend gering (<30%) ist, auch um ein Pendeln von Laden/Entladen zu vermeiden.

Die optimierte Batteriesteuerung ist nur aktiv, wenn die PV Erzeugungsleistung des aktuellen Tages geringer als der Tagesstrombedarf ist (PVgesamt prognostiziert < 17.5kWh). Die Daten können von [SOLCAST](https://solcast.com/free-rooftop-solar-forecasting) über eine persönliche home-use API bezogen werden. Im Verlauf des Tages wird der noch zu erwartende PV-Ertrag bei der Steuerung berücksichtigt. 

Eine Standardlastverteilung des Bedarfs, für einen 4 Personen-Haushalt (24h, berufstätig mit Schulkindern) und einem Stromverbrauch von etwa 15kWh / Tag ist vordefiniert. Der Strombedarf wird dabei grundsätzlich vom aktuellen Zeitpunkt bis zum nächsten Morgen (8 Uhr) bestimmt und berücksichtigt dabei den stündlichen Strombedarf der Lastverteilung.

Bei Verfügbarkeit des Strompreises für den aktuellen und den kommenden Tag wird  ebenfalls berücksichtigt, die Daten können von [evcc](https://evcc.io/) über die HTTP-API, oder alternativ von einer API der Fraunhofer ISE [Energy-Charts](https://www.energy-charts.info/) bezogen werden.

Es wird der benötigte Zustand für die Batterie ermittelt. Eine Steuerung eines (hybriden) Wechselrichters muss, aufgrund der möglichen Komplexität und der Hardwareabhängigkeit, separat implementiert werden:

- eine geschickte Implementierung für die Netzladung kann die Übergabe des ermittelten Netzladungspreises an eine [evcc](https://evcc.io/) Instanz per MQTT/HTTP API sein.
- eine Batteriesperre ist, wenn die aktive Batteriesteuerung von evcc unterstützt wird, z.B. aus dem [evcc](https://evcc.io/)-Wiki ableitbar [WIKI](https://github.com/evcc-io/evcc/wiki/aaa-Lifehacks#entladung-eines-steuerbaren-hausspeicher-preisgesteuert-oder-manuell-sperren). Der konfigurierte Ladepunkt kann entweder mit dem ermittelten Preis konfiguriert, oder per MQTT/HTTP API der Modus vorgegeben werden (Ladungsmodus: aus/schnell).


Bereitgestellt ohne Gewähr. Der Einsatz der bereitgestellten Inhalte erfolgt in eigener Verantwortung.


<h1>@iseeberg79/battery-usage-optimization-nodes</h1>
<h2>Einführung</h2>

Dieses Node-RED-Paket bietet eine Reihe von Nodes zur Optimierung der Batterienutzung. Es umfasst Nodes zur Bestimmung des Batteriemodus, zur Bewertung von Solarprognosen, zur Steuerung des Batteriemodus und mehr.

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


