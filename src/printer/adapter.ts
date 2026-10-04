import { Capacitor, registerPlugin } from '@capacitor/core';
type Device = { name: string; address: string };
type NativePrint = {
  listPairedBluetoothDevices(): Promise<{ devices: Device[] }>;
  connectBluetooth(options: { address: string }): Promise<void>;
  disconnectBluetooth(): Promise<void>;
  cancelBluetooth(): Promise<void>;
  printBluetooth(options: { dataBase64: string }): Promise<{ bytesSent: number }>;
};
const native = registerPlugin<NativePrint>('ShopPrint');
export interface PrinterAdapter {
  connect(address?: string): Promise<string>;
  reconnect(address?: string): Promise<string>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  list(): Promise<Device[]>;
  printReceipt(bytes: Uint8Array): Promise<void>;
}
class BluetoothPrinter implements PrinterAdapter {
  private connected = false;
  private device?: BluetoothDevice;
  private disconnected?: () => void;
  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private printing = false;
  isConnected() { return this.connected && (Capacitor.isNativePlatform() || this.device?.gatt?.connected === true); }
  private async bounded<T>(operation: Promise<T>, milliseconds: number, cancel: () => void | Promise<void>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { this.connected = false; void Promise.resolve().then(cancel).catch(() => {}); reject(new Error('Printer timed out. Check its power, paper and connection, then reconnect.')); }, milliseconds);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  private message(error: unknown, printing = false) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/permission|denied|security/i.test(detail)) return new Error('Allow Bluetooth permission in Android settings, then reconnect the printer.');
    if (/incomplete|timed out/i.test(detail)) return new Error(detail);
    return new Error(printing ? 'Could not send the receipt. Check power and paper, reconnect, and check for a partial receipt before retrying.' : 'Could not connect. Check printer power and release its connection from other apps, then retry.');
  }
  async list() {
    try { return Capacitor.isNativePlatform() ? (await native.listPairedBluetoothDevices()).devices : []; }
    catch (error) { throw this.message(error); }
  }
  async connect(address?: string) {
    this.connected = false;
    if (Capacitor.isNativePlatform()) {
      if (!address) throw new Error('Select a paired printer. Pair it in Android Bluetooth settings first.');
      try { await this.bounded(native.connectBluetooth({ address }), 20000, () => native.cancelBluetooth()); this.connected = true; return address; }
      catch (error) { throw this.message(error); }
    }
    if (!navigator.bluetooth) throw new Error('This browser cannot print over Bluetooth. Use the Android app for Bluetooth Classic printers.');
    const serviceId = 0xffe0;
    const selected = await navigator.bluetooth.requestDevice({ filters: [{ services: [serviceId] }], optionalServices: [serviceId] });
    const previous = this.device;
    if (previous && this.disconnected) previous.removeEventListener?.('gattserverdisconnected', this.disconnected);
    this.device = undefined; this.characteristic = undefined;
    previous?.gatt?.disconnect();
    this.device = selected;
    this.disconnected = () => { if (this.device === selected) { this.connected = false; this.characteristic = undefined; } };
    selected.addEventListener('gattserverdisconnected', this.disconnected);
    return this.connectDevice();
  }
  private async connectDevice() {
    const device = this.device;
    if (!device) throw new Error('Select the printer again to reconnect.');
    try {
      const task = async () => {
        const server = await device.gatt?.connect();
        if (!server) throw new Error('Could not connect to printer.');
        const service = await server.getPrimaryService(0xffe0);
        this.characteristic = await service.getCharacteristic(0xffe1);
      };
      await this.bounded(task(), 15000, () => device.gatt?.disconnect());
      this.connected = true; return device.name || 'BLE printer';
    } catch (error) { device.gatt?.disconnect(); throw this.message(error); }
  }
  async reconnect(address?: string) {
    this.connected = false;
    return Capacitor.isNativePlatform() ? this.connect(address) : this.connectDevice();
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
        const result = await this.bounded(native.printBluetooth({ dataBase64: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) }), 30000, () => native.cancelBluetooth());
        if (result.bytesSent !== bytes.length) throw new Error('Receipt may be incomplete. Check the paper before retrying.');
      } else {
        if (!this.characteristic) throw new Error('Printer disconnected.');
        const characteristic = this.characteristic;
        const task = async () => {
          for (let offset = 0; offset < bytes.length; offset += 20) {
            if (!this.isConnected()) throw new Error('Printer disconnected.');
            const chunk = bytes.slice(offset, offset + 20);
            if (characteristic.properties.write) await characteristic.writeValueWithResponse(chunk);
            else await characteristic.writeValueWithoutResponse(chunk);
          }
        };
        await this.bounded(task(), 30000, () => this.device?.gatt?.disconnect());
      }
    } catch (error) { this.connected = false; throw this.message(error, true); }
    finally { this.printing = false; }
  }
}
export const printer: PrinterAdapter = new BluetoothPrinter();
