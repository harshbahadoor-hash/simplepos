package com.bahadoor.shopprint;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "ShopPrint",
    permissions = {
        @Permission(
            alias = "btConnect",
            strings = { Manifest.permission.BLUETOOTH_CONNECT }
        )
    }
)
public class ShopPrintPlugin extends Plugin {

    private static final int CHUNK_SIZE = 4096;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private BluetoothSocket bluetoothSocket;

    private boolean bluetoothConnectGranted() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return getPermissionState("btConnect") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void connectBluetooth(PluginCall call) {
        String address = call.getString("address");
        if (address == null || address.isEmpty()) {
            call.reject("address is required");
            return;
        }
        if (!bluetoothConnectGranted()) {
            requestPermissionForAlias("btConnect", call, "connectBluetoothPermsCallback");
            return;
        }
        connectBluetoothGranted(call);
    }

    @PermissionCallback
    private void connectBluetoothPermsCallback(PluginCall call) {
        if (!bluetoothConnectGranted()) {
            call.reject("Bluetooth permission denied. Allow Bluetooth to list or print to paired printers.");
            return;
        }
        connectBluetoothGranted(call);
    }

    private void connectBluetoothGranted(PluginCall call) {
        String address = call.getString("address");
        executor.execute(() -> {
            try {
                closeBluetoothQuietly();
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null) {
                    call.reject("Bluetooth not available on this device.");
                    return;
                }
                BluetoothDevice device = adapter.getRemoteDevice(address);
                bluetoothSocket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                bluetoothSocket.connect();
                call.resolve();
            } catch (Exception e) {
                closeBluetoothQuietly();
                call.reject(e.getMessage() != null ? e.getMessage() : "Bluetooth connect failed", e);
            }
        });
    }

    @PluginMethod
    public void printBluetooth(PluginCall call) {
        String dataBase64 = call.getString("dataBase64");
        if (dataBase64 == null) {
            call.reject("dataBase64 is required");
            return;
        }
        executor.execute(() -> {
            try {
                if (bluetoothSocket == null || !bluetoothSocket.isConnected()) {
                    call.reject("Bluetooth not connected. Call connectBluetooth first.");
                    return;
                }
                byte[] data = Base64.decode(dataBase64, Base64.DEFAULT);
                int sent = writeChunked(bluetoothSocket.getOutputStream(), data);
                JSObject ret = new JSObject();
                ret.put("bytesSent", sent);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void disconnectBluetooth(PluginCall call) {
        executor.execute(() -> {
            closeBluetoothQuietly();
            call.resolve();
        });
    }

    @PluginMethod
    public void listPairedBluetoothDevices(PluginCall call) {
        if (!bluetoothConnectGranted()) {
            requestPermissionForAlias("btConnect", call, "listBluetoothPermsCallback");
            return;
        }
        resolveBondedDevices(call);
    }

    @PermissionCallback
    private void listBluetoothPermsCallback(PluginCall call) {
        if (!bluetoothConnectGranted()) {
            JSObject ret = new JSObject();
            ret.put("devices", new JSArray());
            call.resolve(ret);
            return;
        }
        resolveBondedDevices(call);
    }

    private void resolveBondedDevices(PluginCall call) {
        executor.execute(() -> {
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                JSArray devices = new JSArray();
                if (adapter != null) {
                    Set<BluetoothDevice> bonded = adapter.getBondedDevices();
                    if (bonded != null) {
                        for (BluetoothDevice device : bonded) {
                            JSObject item = new JSObject();
                            item.put("name", device.getName() != null ? device.getName() : "");
                            item.put("address", device.getAddress());
                            devices.put(item);
                        }
                    }
                }
                JSObject ret = new JSObject();
                ret.put("devices", devices);
                call.resolve(ret);
            } catch (SecurityException e) {
                JSObject ret = new JSObject();
                ret.put("devices", new JSArray());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Bluetooth list failed", e);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        closeBluetoothQuietly();
        executor.shutdown();
        super.handleOnDestroy();
    }

    private int writeChunked(OutputStream out, byte[] data) throws IOException {
        int offset = 0;
        while (offset < data.length) {
            int len = Math.min(CHUNK_SIZE, data.length - offset);
            out.write(data, offset, len);
            offset += len;
        }
        out.flush();
        return data.length;
    }

    private void closeBluetoothQuietly() {
        if (bluetoothSocket != null) {
            try {
                bluetoothSocket.close();
            } catch (IOException ignored) {
            }
            bluetoothSocket = null;
        }
    }
}
