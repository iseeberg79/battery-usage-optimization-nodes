[![92C08093-CA7B-463E-8BE3-9F03C6622BD6_klein](https://github.com/user-attachments/assets/7716fdb4-b872-445b-ae45-9caabe0a44a3)](## "generated using a public AI image generator")

<h1>Optimierung der Verwendung des Hausspeichers im Zusammenspiel von ioBroker, node-red, evcc und einem dynamischen Stromtarif</h1>

<h2>Funktionsweise:</h2>
Der Batteriespeicher soll bei überschüssigem PV-Strom geladen, aber nicht in Zeiten günstigen Netzstromes entladen werden. Ist die Preisdifferenz ausreichend hoch (>15ct) wird eine Netzladung zum günstigsten Zeitpunkt des Tages erwogen und die Batterie bis zum Füllstand von 80% geladen. Um die Batterie nicht ungünstig zu entladen, wird der Netzladungspreis bei der weiteren Steuerung der Batteriesperre berücksichtigt, und die Freigabe der Batterie erfolgt nur bei einem Netzstrompreis, der ausreichend über dem Netzladungspreis liegt (~130%). Die Batterie wird außerdem nur geladen, wenn Stand des Batteriespeichers ausreichend gering (<30%) ist, auch um ein Pendeln von Laden/Entladen zu vermeiden.

Die optimierte Batteriesteuerung ist nur aktiv, wenn die PV Erzeugungsleistung des aktuellen Tages geringer als der Tagesstrombedarf ist (PVgesamt prognostiziert < 17.5kWh).

Eine Standardlastverteilung des Bedarfs, für einen 4 Personen-Haushalt (24h, berufstätig mit Schulkindern) und einem Stromverbrauch von etwa 15kWh / Tag ist vordefiniert. Der Strombedarf wird dabei grundsätzlich vom aktuellen Zeitpunkt bis zum nächsten Morgen (8 Uhr) bestimmt und berücksichtigt dabei den stündlichen Strombedarf der Lastverteilung.

Im Verlauf des Tages wird der noch zu erwartende PV-Ertrag bei der Steuerung berücksichtigt.
Bei Verfügbarkeit des Strompreises für den kommenden Tag, sowie der entsprechenden PV-Prognose wird dies ebenfalls berücksichtigt.


<h1>@iseeberg79/battery-usage-optimization-nodes</h1>
<h2>Einführung</h2>

Dieses Node-RED-Paket bietet eine Reihe von Nodes zur Optimierung der Batterienutzung. Es umfasst Nodes zur Bestimmung des Batteriemodus, zur Bewertung von Solarprognosen, zur Steuerung des Batteriemodus und mehr.

Flowbeispiel

![image](https://github.com/user-attachments/assets/1c4a369d-64c1-418e-a78a-64b8db0d65cb)

Kontextdaten des Flows

![image](https://github.com/user-attachments/assets/68014f67-9ed2-49fe-8f56-b0fb2f8dc44f)


Installation

Zum Beispiel als Upload im Palettenmanager von node-red in ioBroker, bzw.:
npm install @iseeberg79/battery-usage-optimization-nodes


## Links 

[evcc](https://evcc.io) 

[solcast](https://solcast.com.au) 

[iobroker.net](https://www.iobroker.net) 

[node-red](https://nodered.org) 

