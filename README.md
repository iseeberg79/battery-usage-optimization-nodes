
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
- Prognose einer optimierten Batteriesteuerung

Die Nodes sind flexibel nutzbar und können mit externen Datenquellen kombiniert werden. Es besteht die Möglichkeit, eigene Nodes für zusätzliche Datenquellen zu integrieren. So kann die Lösung mit oder ohne evcc betrieben werden. Die Nodes sind mit Standardwerten vorkonfiguriert, wobei die Nachrichteneingänge eine Konfigurationsanpassung ermöglichen. Das modulare Design erleichtert die Wiederverwendung und Anpassung an unterschiedliche Installationen.

Eine externe Steuerung kann eingebunden werden, die weiterhin den Status der evcc-Laderegelung und aktuelle Energiewerte berücksichtigt. 

Die Prognosefunktion der Steuerung bildet eine solche externe Vorgabe ab. Es wird ein JSON geliefert, das für die Steuerung verwendet werden kann: 

| Startzeit                | Energie | Importpreis (€/kWh) | prog.Kosten (€) | Modus   | Verbrauch (-kWh) | Produktion (+kWh) | Entladung (-kWh) | SoC (%) | eff.Preis (€/kWh) | opt.Kosten (€) |
|--------------------------|------|---------------------|------------|---------|------------------|------------------|---------------|---------|------------------------|--------------|
| 2025-03-03 06:00:00+01:00 | 1    | 0.3150              | 0.3150     | normal  | 1                | 0                | 0             | 5       | 0.0948                 | 0.3150       |
| 2025-03-03 07:00:00+01:00 | 0.427| 0.3453              | 0.2016     | normal  | 1                | 0.00265          | 0.57          | 5       | 0.0948                 | 0.2016       |
| 2025-03-03 08:00:00+01:00 | 0.239| 0.3269              | 0.0780     | normal  | 0.4              | 0.1613           | 0             | 5       | 0.0948                 | 0.0780       |
| 2025-03-03 09:00:00+01:00 | 0.115| 0.2784              | 0.0320     | normal  | 0.4              | 0.28515          | 0             | 5       | 0.0948                 | 0.0320       |
| 2025-03-03 10:00:00+01:00 | -0.334| 0.2375             | 0          | hold    | 0.4              | 0.7343           | 0             | 7.95    | 0.0790                 | 0            |
| 2025-03-03 11:00:00+01:00 | -2.382| 0.1590             | 0          | hold    | 0.4              | 2.7824           | 0             | 30.64   | 0.0790                 | 0            |
| 2025-03-03 12:00:00+01:00 | -3.796| 0.1517             | 0          | hold    | 1                | 4.79605          | 0             | 66.79   | 0.0790                 | 0            |
| 2025-03-03 13:00:00+01:00 | -5.208| 0.1514             | 0          | hold    | 1                | 6.20825          | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 14:00:00+01:00 | -6.678| 0.2244             | 0          | hold    | 0.4              | 7.07795          | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 15:00:00+01:00 | -6.742| 0.2514             | 0          | hold    | 0.4              | 7.1421           | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 16:00:00+01:00 | -5.781| 0.2779             | 0          | hold    | 0.4              | 6.1807           | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 17:00:00+01:00 | -3.360| 0.3284             | 0          | hold    | 1                | 4.3602           | 0             | 100     | 0.0790                 | 0            |
| 2025-03-03 18:00:00+01:00 | 0    | 0.3702              | 0.0375     | normal  | 1                | 0.6044           | 0.3956        | 96.23   | 0.0948                 | 0.0375       |
| 2025-03-03 19:00:00+01:00 | 0    | 0.3607              | 0.0948     | normal  | 1                | 0                | 1             | 86.71   | 0.0948                 | 0.0948       |
| 2025-03-03 20:00:00+01:00 | 0    | 0.3304              | 0.0948     | normal  | 1                | 0                | 1             | 77.18   | 0.0948                 | 0.0948       |


Es wird der optimierte Verlauf der bekannten Prognosedaten (Preis, PV-Forecast) berechnet, dies schließt eine optionale Netzladung ein. Es werden Statistik- und Berechnungsdaten ausgegeben.
Das obige Beispiel ist für einen Tag mit ausreichend Solarertrag und hohen Preisen außerhalb der Zeiten mit Solarerzeugung erstellt. Eine Steuerung ist nicht nötig, würde hier jedoch bei Stunden mit niedrigen Strompreisen verwendet. 

Die Statistikdaten ermöglichen eine Berechnung, ob eine Optimierung zu Preisersparnissen führt:

![image](https://github.com/user-attachments/assets/c19cf251-4244-4232-b647-efa5c4d7c611)

Die übergebene Standardverteilung des prognostizierten Strombedarfes entscheidet über die Genauigkeit des Ergebnisses. 



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


t

<h2>Links</h2>

[evcc](https://evcc.io) 

[solcast](https://solcast.com.au) 

[Open-Meteo](https://open-meteo.com/)

[Energy-Charts](https://www.energy-charts.info/)

[iobroker.net](https://www.iobroker.net) 

[node-red](https://nodered.org) 


