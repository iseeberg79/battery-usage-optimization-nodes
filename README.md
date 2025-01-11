[![92C08093-CA7B-463E-8BE3-9F03C6622BD6_klein](https://github.com/user-attachments/assets/7716fdb4-b872-445b-ae45-9caabe0a44a3)](## "generated using a public AI image generator")

<h1>Optimierung der Verwendung des Hausspeichers im Zusammenspiel von ioBroker, evcc und einem dynamischen Stromtarif</h1>

<h2>Funktionsweise:</h2>
Der Batteriespeicher soll bei überschüssigem PV-Strom geladen, aber nicht in Zeiten günstigen Netzstromes entladen werden. Ist die Preisdifferenz ausreichend hoch (>15ct) wird eine Netzladung zum günstigsten Zeitpunkt des Tages erwogen und die Batterie bis zum Füllstand von 80% geladen. Um die Batterie nicht ungünstig zu entladen, wird der Netzladungspreis bei der weiteren Steuerung der Batteriesperre berücksichtigt, und die Freigabe der Batterie erfolgt nur bei einem Netzstrompreis, der ausreichend über dem Netzladungspreis liegt (~130%). Die Batterie wird außerdem nur geladen, wenn Stand des Batteriespeichers ausreichend gering (<30%) ist, auch um ein Pendeln von Laden/Entladen zu vermeiden.

Die optimierte Batteriesteuerung ist nur aktiv, wenn die PV Erzeugungsleistung des aktuellen Tages geringer als der Tagesstrombedarf ist (PVgesamt prognostiziert < 17.5kWh).

Eine Standardlastverteilung des Bedarfs, für einen 4 Personen-Haushalt (24h, berufstätig mit Schulkindern) und einem Stromverbrauch von etwa 15kWh / Tag ist vordefiniert. Der Strombedarf wird dabei grundsätzlich vom aktuellen Zeitpunkt bis zum nächsten Morgen (6 Uhr) bestimmt und berücksichtigt dabei den stündlichen Strombedarf der Lastverteilung.

Im Verlauf des Tages wird der noch zu erwartende PV-Ertrag bei der Steuerung berücksichtigt.
Bei Verfügbarkeit des Strompreises für den kommenden Tag, sowie der entsprechenden PV-Prognose wird dies ebenfalls berücksichtigt.



<h1>@iseeberg79/battery-usage-optimization-nodes</h1>
<h2>Einführung</h2>

Dieses Node-RED-Paket bietet eine Reihe von Nodes zur Optimierung der Batterienutzung. Es umfasst Nodes zur Bestimmung des Batteriemodus, zur Bewertung von Solarprognosen, zur Steuerung des Batteriemodus und mehr.

![image](https://github.com/user-attachments/assets/1c4a369d-64c1-418e-a78a-64b8db0d65cb)


Installation

npm install @iseeberg79/battery-usage-optimization-nodes
Enthaltene Nodes
DetermineBatteryMode Node

Dieser Node ermöglicht die Bestimmung des Batteriemodus.
Konfigurationsparameter

    Name: Der Name des Nodes.

    Enable Grid Charge Threshold (%): Schwellenwert zum Aktivieren der Netzladung.

    Disable Grid Charge Threshold (%): Schwellenwert zum Deaktivieren der Netzladung.

    Battery Capacity (mAh): Batteriekapazität.

    Minimum State of Charge (%): Mindestladezustand.

    Maximum State of Charge (%): Maximaler Ladezustand.

    Efficiency (%): Effizienz.

Eingänge und Ausgänge

    Inputs: 1

    Outputs: 3

Beispiel

[ { "id": "82dd0e75ab4e8057", "type": "@iseeberg79/DetermineBatteryMode", "name": "DetermineBatteryMode", "enableGridchargeThreshold": 50, "disableGridchargeThreshold": 80, "batteryCapacity": 10000, "minsoc": 10, "maxsoc": 90, "efficiency": 80, "wires": [ ["92756aee73cf3429"], ["bda0e3da5f255de3"], ["80e651b549dd7fd6"] ] } ]
EvaluateSolarForecast Node

Dieser Node ermöglicht die Abrufung und Verarbeitung von Solarertragsprognosen.
Konfigurationsparameter

    Name: Der Name des Nodes.

    Rooftop ID: Die ID des Solardachs.

    Token: Das Authentifizierungstoken.

Eingänge und Ausgänge

    Inputs: 1

    Outputs: 1

Beispiel

[ { "id": "b77a8513151be91c", "type": "@iseeberg79/EvaluateSolarForecast", "name": "EvaluateSolarForecast", "rooftopid": "exampleRooftopID", "token": "exampleToken", "wires": [ ["1a669e4a805a3853"] ] } ]
ControlBattery Node

Dieser Node ermöglicht die Steuerung des Batteriemodus.
Konfigurationsparameter

    Name: Der Name des Nodes.

    Configured Min SoC (%): Konfigurierter Mindestladezustand.

    Maximum Grid Price: Maximale Stromnetzpreis.

    Configured Battery Lock: Konfigurierte Batteriesperre.

Eingänge und Ausgänge

    Inputs: 1

    Outputs: 4

Beispiel

[ { "id": "d09f6df58df1c555", "type": "@iseeberg79/ControlBattery", "name": "ControlBattery", "configuredMinSoC": 5, "maximumGridprice": 0.35, "configuredBatteryLock": false, "wires": [ ["a1c7df7658c158df"], ["5ca5af7eb067158a"], ["02518b11ef345f08"], ["75e92935fdb92674"] ] } ]
DeterminePowerValues Node

Dieser Node ermöglicht den Abruf und die Verarbeitung der aktuellen Leistungsdaten von evcc.
Konfigurationsparameter

    Name: Der Name des Nodes.

    URL: Die URL für die API-Anfrage.

Eingänge und Ausgänge

    Inputs: 1

    Outputs: 1

Beispiel

[ { "id": "589d8efc8953672a", "type": "@iseeberg79/DeterminePowerValues", "name": "DeterminePowerValues", "url": "http://localhost:7070/api/state", "wires": [ ["9fc0a768b4993fb7"] ] } ]
DetermineControlMode Node

Dieser Node ermöglicht die Bestimmung des Steuerungsmodus.
Konfigurationsparameter

    Name: Der Name des Nodes.

Eingänge und Ausgänge

    Inputs: 1

    Outputs: 1

Beispiel

[ { "id": "abc123", "type": "@iseeberg79/DetermineControlMode", "name": "DetermineControlMode", "wires": [ ["def456"] ] } ]
EstimateHouseholdConsumption Node

Dieser Node ermöglicht die Schätzung des Haushaltsverbrauchs.
Konfigurationsparameter

    Name: Der Name des Nodes.

Eingänge und Ausgänge

    Inputs: 1

    Outputs: 1

Beispiel

[ { "id": "ghi789", "type": "@iseeberg79/EstimateHouseholdConsumption", "name": "EstimateHouseholdConsumption", "wires": [ ["jkl012"] ] } ]
EvaluateGridEnergyPricesAPI Node

Dieser Node ermöglicht die Bewertung von Netzenergiepreisen über eine API.
Konfigurationsparameter

    Name: Der Name des Nodes.

    API Key: Der API-Schlüssel.

Eingänge und Ausgänge

    Inputs: 1

    Outputs: 1

Beispiel

[ { "id": "mno345", "type": "@iseeberg79/EvaluateGridEnergyPricesAPI", "name": "EvaluateGridEnergyPricesAPI", "apikey": "exampleApiKey", "wires": [ ["pqr678"] ] } ]
EvaluateGridEnergyPrices Node

Dieser Node ermöglicht die Bewertung von Netzenergiepreisen.
Konfigurationsparameter

    Name: Der Name des Nodes.

Eingänge und Ausgänge

    Inputs: 1

    Outputs: 1

Beispiel

[ { "id": "stu901", "type": "@iseeberg79/EvaluateGridEnergyPrices", "name": "EvaluateGridEnergyPrices", "wires": [ ["vwx234"] ] } ]
EstimateSolarEnergy Node

Dieser Node ermöglicht die Schätzung der Solarenergie.
Konfigurationsparameter

    Name: Der Name des Nodes.

Eingänge und Ausgänge

    Inputs: 1

    Outputs: 1

Beispiel

[ { "id": "yz567", "type": "@iseeberg79/EstimateSolarEnergy", "name": "EstimateSolarEnergy", "wires": [ ["abc890"] ] } ]
