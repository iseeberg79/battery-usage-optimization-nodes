[![92C08093-CA7B-463E-8BE3-9F03C6622BD6_klein](https://github.com/user-attachments/assets/7716fdb4-b872-445b-ae45-9caabe0a44a3)](## "generated using a public AI image generator")

<h1>Optimierung der Verwendung des Hausspeichers im Zusammenspiel von ioBroker, evcc und einem dynamischen Stromtarif</h1>

<h2>Funktionsweise:</h2>
Der Batteriespeicher soll bei überschüssigem PV-Strom geladen, aber nicht in Zeiten günstigen Netzstromes entladen werden. Ist die Preisdifferenz ausreichend hoch (>15ct) wird eine Netzladung zum günstigsten Zeitpunkt des Tages erwogen und die Batterie bis zum Füllstand von 80% geladen. Um die Batterie nicht ungünstig zu entladen, wird der Netzladungspreis bei der weiteren Steuerung der Batteriesperre berücksichtigt, und die Freigabe der Batterie erfolgt nur bei einem Netzstrompreis, der ausreichend über dem Netzladungspreis liegt (~130%). Die Batterie wird außerdem nur geladen, wenn Stand des Batteriespeichers ausreichend gering (<30%) ist, auch um ein Pendeln von Laden/Entladen zu vermeiden.

Die optimierte Batteriesteuerung ist nur aktiv, wenn die PV Erzeugungsleistung des aktuellen Tages geringer als der Tagesstrombedarf ist (PVgesamt prognostiziert < 17.5kWh).

Eine Standardlastverteilung des Bedarfs, für einen 4 Personen-Haushalt (24h, berufstätig mit Schulkindern) und einem Stromverbrauch von etwa 15kWh / Tag ist vordefiniert. Der Strombedarf wird dabei grundsätzlich vom aktuellen Zeitpunkt bis zum nächsten Morgen (6 Uhr) bestimmt und berücksichtigt dabei den stündlichen Strombedarf der Lastverteilung.

Im Verlauf des Tages wird der noch zu erwartende PV-Ertrag bei der Steuerung berücksichtigt.
Bei Verfügbarkeit des Strompreises für den kommenden Tag, sowie der entsprechenden PV-Prognose wird dies ebenfalls berücksichtigt.


<h2>Abhängigkeiten:</h2>
<h3>Hardware:</h3>

 - <a href="https://evcc.io" target="_blank">evcc</a>  integrierter Wechselrichter und Batterie
 - Steuerungsmöglichkeit des Wechselrichters bzw. der Batterie
   - aktive Batteriesteuerung  

<h3>Software:</h3>

 - installierte evcc Instanz
 - installiertes IOBroker inkl.
   - Pvforecast-Instanz (hier: solcast)
   - Tibber-Instanz
   - Alias-Instanz
   - node.red-Instanz, mit 'node-red-contrib-sun-position' und 'node-red-contrib-special-date',
   - import dieses Paketes 
     
(vorzugsweise mit MQTT und InfluxDB)
 
Von node.red aus wird auf die integrierten Daten von IOBroker zugegriffen (z.B. evcc, Wechselrichter&Batterie, dyn. Stromanbieter, sowie PVForecast-Adapter).
Eine Installation von evcc ist integriert und per MQTT steuerbar/abfragbar

Die Alias-Definitionen sind eingespielt (json), mit lokalen Datenwerten verknüpft und im Node erreichbar. 
Es wird vorausgesetzt:
 - aktuelle Verbrauchswerte
 - aktuelle und zukünftige Preisinformationen
 - der durchschnittliche Strompreis der letzten Woche (zur Optimierung)
   - ermittelbar z.B. per Abfrage (AVG, group by week)  aus den Werten der InfluxDB in IOBroker (ansonsten statisch vorzugeben, z.B. 0.24 Euro)
 - tagesaktuelle PV Prognosedaten des Gesamtertrages
   - inkl. der Verteilung des Ertrags über den Tag
 - Leistungsdaten der Batterie, zur Regelung:
   - Batteriestand (soc)
   - minimaler Batteriestand (minsoc)
   - Batterieleistungswerte (Laderegelung, intern zur Prüfung!)
 
In der Node-Konfiguration ist ebenfalls eine Grundeinstellung enthalten:
 - Tagesverbrauch ~15kWh, Standardlastkurve 
 - weitere Konfigurationseinstellungen, wie z.B. maximaler Ladepreis, etc.

Der Knoten sollte instantiiert werden, um dann die Werte der Ausgabekanäle weiter zu verarbeiten. So wird der aktuell empfohlene Zustand für die Batteriekontrolle (normal, hold, charge) dynamisch berechnet und im ersten Ausgang ein empfohlener Wert für den minimalen Ladestand ausgegeben. 
Dieser ist entweder minimal, oder maximal – d.h. er legt die Grundlage für eine Batteriesperre mit anderen Mitteln, z.B. per modbus-Kontrolle.

Die evcc-Zustände haben dabei Vorrang, d.h. es wird nur im evcc-Batteriemodus „unknown/normal/charge“ gesteuert. Gibt evcc den Modus für die Batteriesperre („hold“) vor, überschreibt dieser den berechneten Mechanismus. Es wird davon ausgegangen, das die Netzladung per evcc-Instanz unter Konfiguration des aktuellen Strompreises gestartet werden kann.

An einem anderen Ausgang wird der Strompreis (in Euro) als Grenzwert für die Netzladung zur Weitergabe als "GridChargeLimit" an evcc ausgegeben, dies kann z.B. per HTTP- oder MQTT-API erfolgen.

Die anderen Ausgänge sind für eine mögliche Visualisierung oder Statistik, sowie für weitergehende Integrationen gedacht und enthalten ergänzende Informationen.

Ohne aktivierte Batteriesteuerung und dynamischem Stromtarif ist eine Steuerung nicht möglich.


<h2>detaillierte Beschreibung der Alias-Definitionen:</h3>

| Alias | Beschreibung | Zugriff | Typ |
| --- | --- | --- | --- |
| energy.control.effectiveGridChargeCostLimit | aktuelle Regelgrenze für die Batteriesperre | schreibend | float
| energy.control.enableGridcharging | erlaube die Netzladung der Batterie | schreibend | bool
| energy.control.enableOptimization | erlaube die Steuerung der Hausbatterie | schreibend | bool
| energy.control.lastGridChargePrice | letzter Preis für die Netzladung der Hausbatterie | schreibend | float
|  |  |
| energy.battery.targetMode	| bestimmter Batteriemodus (unknown/normal/hold/charge) | schreibend |  string
|  |  |
| energy.control.batterylock | erzwungende Batteriesperre z.B. per UI | lesend | bool
| energy.control.gridChargeCostLimit | regelbare Preisgrenze für die Netzladung (bis 0.35€) | lesend | float
|  |  |
| energy.battery.chargePower | aktuelle Batterieleistung | lesend | int
| energy.battery.minsoc | aktueller minSoC der Batterie | lesend | int
| energy.battery.soc | aktueller SoC der Batterie | lesend | int
|  |  |
| energy.grid.consumption	| aktueller Strombedarf (Zählerwert in Watt) | lesend | int
| energy.grid.price | Strompreis (jetzt) | lesend | float
| energy.grid.prive_avg_weekly | durchschnittlicher Strompreis (historisch, 1 Woche) | lesend | float
| energy.grid.price_max | maximaler Strompreis (bekannt) | lesend | float
| energy.grid.price_min | minimaler Strompreis (bekannt) | lesend | float
| energy.grid.price_today | durchschnittlicher Strompreis (heute)|lesend | float
| energy.grid.price_tomorrow | durchschnittlicher Strompreis (morgen) | lesend | float
| energy.grid.pricelevel | aktuelles Preislevel (heute)<br>(VERY CHEAP" / CHEAP / NORMAL / EXPENSIVE / "VERY EXPENSIVE" | lesend | string 
| energy.grid.pricelevel_min | günstigstes Preislevel (heute)<br>"VERY CHEAP" / CHEAP / NORMAL / EXPENSIVE / "VERY EXPENSIVE" | lesend | string
|  |  | 
| energy.evcc.batteryDischargeControl | Konfigurationseinstellung (evcc) der Batteriesteuerung | lesend | bool
| energy.evcc.tariffPriceHome | aktuell kalkulierter Preis (evcc) für den Hausverbrauch | lesend | float
|  |  | 
| energy.pv.forecast_today | prog. Solarstromertrag (heute) | lesend | float
| energy.pv.price_feedin | Einspeisevergütung (fix) | lesend | float
| energy.pv.production | aktuelle Stromerzeugung (in Watt) | lesend | int
| energy.pv.pvforecast_summary_JSONData | gelieferter Datensatz der Solarprognose (solcast-Format?) | lesend | json

<h3>Vorschlag zur Preisermittlung</h3>

![image](https://github.com/user-attachments/assets/a69cdc5b-7a3c-4f80-83de-2e6877d01662)

Mit Hilfe eines InfluxDB Node und folgender Abfrage an die InfluxDB kann ein Veränderungen erfassender Datenwert als Grundlage herangezogen werden:

![image](https://github.com/user-attachments/assets/43921dac-2ce3-456b-b8aa-6cabf5d9b53b)

![image](https://github.com/user-attachments/assets/fe501c9d-9dc1-4187-a42d-5c51739904ce)

![image](https://github.com/user-attachments/assets/5a077772-2399-4057-8248-323821a99068)


SQL:
select mean(*) from "tibberlink.x.xxx-yyy-zzz.CurrentPrice.total" where time>(now() - 7d) group by time(7d) fill(none)

![image](https://github.com/user-attachments/assets/c87578c6-3648-43b0-a198-d96422c589e1)

Der eigentlichen Wert erhält man dann z.B. mit folgender Bearbeitung und speichert ihn z.B. in einem eigenen Datenwert dauerhaft ab:

![image](https://github.com/user-attachments/assets/b471150d-b6de-4951-abbe-745efd0e9cf2)



<h2>Beispielintegration</h2>

![image](https://github.com/user-attachments/assets/13b9fc2e-bb54-4344-885d-6044d5d0241a)

Der aufwändige Aufbau für die Steuerung der Batteriesperre („schreiben 1042“, ff.) ist in diesem Beispiel nötig, um nicht konkurrierend zur evcc-Instanz mit dem modbus-Proxy zu steuern und ermöglicht eine Verallgemeinerung der Logik. Außerdem wird sichergestellt, dass die Steuerung im richtigen Kontext erfolgt und Rücksicht auf eventuelle vorherige Zustände von evcc nimmt.
Dieses Beispiel nutzt abweichend zu evcc das Register für den minimalen Ladestand der Batterie (1042), um eine PV-Ladung von überschüssigem Strom bei Batteriesperre zu ermöglichen. Da nicht zwingend ein Ladepunkt aktiv ist, der die PV Leistung abnimmt, ist dies hier von Vorteil für die optimale Verwendung des erzeugten Solarstromes.

Alternativ könnte mit den Ausgaben z.B. eine Steuerung über einen Ladepunkt (<a href="https://github.com/evcc-io/evcc/wiki/aaa-Lifehacks#entladung-eines-steuerbaren-hausspeicher-preisgesteuert-oder-manuell-sperren" target="_blank">Workaround</a>) oder eventuell zukünftig(!) mit Hilfe eines Parameters für eine externe Steuerung in evcc realisiert werden.
