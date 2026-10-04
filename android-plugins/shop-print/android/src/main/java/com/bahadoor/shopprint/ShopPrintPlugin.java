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
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

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
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
    private volatile BluetoothSocket bluetoothSocket;
    private final AtomicInteger generation = new AtomicInteger();
    private volatile boolean destroyed;

    private synchronized void submit(PluginCall call, Runnable task) {
        if (destroyed) { call.reject("Printer operation canceled because the app closed."); return; }
        try { executor.execute(task); }
        catch (RejectedExecutionException e) { call.reject("Printer operation canceled.", e); }
    }

    private boolean bluetoothConnectGranted() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return getPermissionState("btConnect") == PermissionState.GRANTED;
    }

    @PluginMethod
    public synchronized void connectBluetooth(PluginCall call) {
        if (destroyed) { call.reject("Printer connection canceled because the app closed."); return; }
        String address = call.getString("address");
        if (address == null || address.isEmpty()) {
            call.reject("address is required");
            return;
        }
        call.getData().put("_connectionGeneration", generation.incrementAndGet());
        if (!bluetoothConnectGranted()) {
            requestPermissionForAlias("btConnect", call, "connectBluetoothPermsCallback");
            return;
        }
        connectBluetoothGranted(call);
    }

    @PermissionCallback
    private void connectBluetoothPermsCallback(PluginCall call) {
        if (destroyed || call.getInt("_connectionGeneration", -1) != generation.get()) {
            call.reject("Printer connection canceled. Reconnect when ready.");
            return;
        }
        if (!bluetoothConnectGranted()) {
            call.reject("Bluetooth permission denied. Allow Bluetooth to list or print to paired printers.");
            return;
        }
        connectBluetoothGranted(call);
    }

    private void connectBluetoothGranted(PluginCall call) {
        String address = call.getString("address");
        int attempt = call.getInt("_connectionGeneration", -1);
        submit(call, () -> {
            if (destroyed || attempt != generation.get()) { call.reject("Printer connection canceled."); return; }
            AtomicBoolean finished = new AtomicBoolean();
            ScheduledFuture<?> timeout = null;
            try {
                timeout = deadlines.schedule(() -> {
                    if (finished.compareAndSet(false, true)) {
                        closeBluetoothQuietly();
                        call.reject("Printer connection timed out. Check power and reconnect.");
                    }
                }, 15, TimeUnit.SECONDS);
                closeBluetoothQuietly();
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null) {
                    if (finished.compareAndSet(false, true)) call.reject("Bluetooth not available on this device.");
                    return;
                }
                BluetoothDevice device = adapter.getRemoteDevice(address);
                BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                synchronized (this) {
                    if (destroyed || finished.get() || attempt != generation.get()) {
                        socket.close();
                        if (finished.compareAndSet(false, true)) call.reject("Printer connection canceled.");
                        return;
                    }
                    bluetoothSocket = socket;
                }
                socket.connect();
                if (destroyed || attempt != generation.get()) {
                    closeBluetoothQuietly();
                    if (finished.compareAndSet(false, true)) call.reject("Printer connection canceled.");
                    return;
                }
                if (finished.compareAndSet(false, true)) call.resolve();
            } catch (Exception e) {
                closeBluetoothQuietly();
                if (finished.compareAndSet(false, true)) call.reject(e.getMessage() != null ? e.getMessage() : "Bluetooth connect failed", e);
            } finally { if (timeout != null) timeout.cancel(false); }
        });
    }

    @PluginMethod
    public void printBluetooth(PluginCall call) {
        String dataBase64 = call.getString("dataBase64");
        if (dataBase64 == null) {
            call.reject("dataBase64 is required");
            return;
        }
        submit(call, () -> {
            AtomicBoolean finished = new AtomicBoolean();
            ScheduledFuture<?> timeout = null;
            try {
                timeout = deadlines.schedule(() -> {
                    if (finished.compareAndSet(false, true)) {
                        closeBluetoothQuietly();
                        call.reject("Printing timed out. Check for a partial receipt before retrying.");
                    }
                }, 25, TimeUnit.SECONDS);
                BluetoothSocket socket = bluetoothSocket;
                if (socket == null || !socket.isConnected()) {
                    if (finished.compareAndSet(false, true)) call.reject("Bluetooth not connected. Call connectBluetooth first.");
                    return;
                }
                byte[] data = Base64.decode(dataBase64, Base64.DEFAULT);
                int sent = writeChunked(socket.getOutputStream(), data);
                JSObject ret = new JSObject();
                ret.put("bytesSent", sent);
                if (finished.compareAndSet(false, true)) call.resolve(ret);
            } catch (Exception e) {
                closeBluetoothQuietly();
                if (finished.compareAndSet(false, true)) call.reject(e.getMessage(), e);
            } finally { if (timeout != null) timeout.cancel(false); }
        });
    }

    @PluginMethod
    public void disconnectBluetooth(PluginCall call) {
        generation.incrementAndGet();
        closeBluetoothQuietly();
        call.resolve();
    }

    @PluginMethod
    public void cancelBluetooth(PluginCall call) {
        generation.incrementAndGet();
        closeBluetoothQuietly();
        call.resolve();
    }

    @PluginMethod
    public synchronized void listPairedBluetoothDevices(PluginCall call) {
        if (destroyed) { call.reject("Printer operation canceled because the app closed."); return; }
        if (!bluetoothConnectGranted()) {
            requestPermissionForAlias("btConnect", call, "listBluetoothPermsCallback");
            return;
        }
        resolveBondedDevices(call);
    }

    @PermissionCallback
    private void listBluetoothPermsCallback(PluginCall call) {
        if (destroyed) { call.reject("Printer operation canceled because the app closed."); return; }
        if (!bluetoothConnectGranted()) {
            call.reject("Bluetooth permission denied. Allow Bluetooth in Android settings.");
            return;
        }
        resolveBondedDevices(call);
    }

    private void resolveBondedDevices(PluginCall call) {
        submit(call, () -> {
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
                call.reject("Bluetooth permission denied. Allow Bluetooth in Android settings.", e);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Bluetooth list failed", e);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            destroyed = true;
            generation.incrementAndGet();
            closeBluetoothQuietly();
        }
        executor.shutdownNow();
        deadlines.shutdownNow();
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

    private synchronized void closeBluetoothQuietly() {
        BluetoothSocket socket = bluetoothSocket;
        bluetoothSocket = null;
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }
}
