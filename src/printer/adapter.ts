import { Capacitor, registerPlugin } from '@capacitor/core';
type Device = { name: string; address: string };
type NativePrint = {
  listPairedBluetoothDevices(): Promise<{ devices: Device[] }>;
  connectBluetooth(options: { address: string }): Promise<void>;
  disconnectBluetooth(): Promise<void>;
  printBluetooth(options: { dataBase64: string }): Promise<{ bytesSent: number }>;
};
const native = registerPlugin<NativePrint>('ShopPrint');
export interface PrinterAdapter {
  connect(address?: string): Promise<string>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  list(): Promise<Device[]>;
  printReceipt(bytes: Uint8Array): Promise<void>;
}
class BluetoothPrinter implements PrinterAdapter {
  private connected = false;
  private device?: BluetoothDevice;
  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private printing = false;
  isConnected() { return this.connected && (Capacitor.isNativePlatform() || this.device?.gatt?.connected === true); }
  async list() { return Capacitor.isNativePlatform() ? (await native.listPairedBluetoothDevices()).devices : []; }
  async connect(address?: string) {
    this.connected = false;
    if (Capacitor.isNativePlatform()) {
      if (!address) throw new Error('Select a paired printer. Pair it in Android Bluetooth settings first.');
      await native.connectBluetooth({ address }); this.connected = true; return address;
    }
    if (!navigator.bluetooth) throw new Error('This browser cannot print over Bluetooth. Use the Android app for Bluetooth Classic printers.');
    const serviceId = 0xffe0;
    this.device = await navigator.bluetooth.requestDevice({ filters: [{ services: [serviceId] }], optionalServices: [serviceId] });
    this.device.addEventListener('gattserverdisconnected', () => { this.connected = false; });
    const server = await this.device.gatt?.connect();
    if (!server) throw new Error('Could not connect to printer.');
    const service = await server.getPrimaryService(serviceId);
    this.characteristic = await service.getCharacteristic(0xffe1);
    this.connected = true;
    return this.device.name || 'BLE printer';
  }
  async disconnect() {
    this.connected = false;
    if (Capacitor.isNativePlatform()) await native.disconnectBluetooth(); else this.device?.gatt?.disconnect();
  }
  async printReceipt(bytes: Uint8Array) {
    if (!this.isConnected()) throw new Error('Printer disconnected. Connect it in settings, then retry.');
    if (this.printing) throw new Error('Printing is already in progress.');
    this.printing = true;
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await native.printBluetooth({ dataBase64: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) });
        if (result.bytesSent !== bytes.length) throw new Error('Receipt may be incomplete. Check the paper before retrying.');
      } else {
        if (!this.characteristic) throw new Error('Printer disconnected.');
        for (let offset = 0; offset < bytes.length; offset += 20) {
          const chunk = bytes.slice(offset, offset + 20);
          if (this.characteristic.properties.write) await this.characteristic.writeValueWithResponse(chunk);
          else await this.characteristic.writeValueWithoutResponse(chunk);
        }
      }
    } catch (error) { this.connected = false; throw error; }
    finally { this.printing = false; }
  }
}
export const printer: PrinterAdapter = new BluetoothPrinter();
