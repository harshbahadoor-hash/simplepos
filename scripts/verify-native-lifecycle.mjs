// Compile the actual plugin against small platform stubs to control thread races.
// This tests lifecycle ordering, not Android Bluetooth radio behavior.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = resolve(process.argv[2] ?? 'android-plugins/shop-print/android/src/main/java/com/bahadoor/shopprint/ShopPrintPlugin.java');
const root = mkdtempSync(join(tmpdir(), 'simplepos-native-'));
if (!realpathSync(root).startsWith(realpathSync(tmpdir()) + sep + 'simplepos-native-')) throw new Error('Unexpected fixture path');
const files = {
  'android/Manifest.java': 'package android; public class Manifest { public static class permission { public static final String BLUETOOTH_CONNECT="bluetooth"; } }',
  'android/os/Build.java': 'package android.os; public class Build { public static class VERSION { public static int SDK_INT=30; } }',
  'android/util/Base64.java': 'package android.util; public class Base64 { public static final int DEFAULT=0; public static byte[] decode(String s,int flags) { return java.util.Base64.getDecoder().decode(s); } }',
  'android/bluetooth/BluetoothAdapter.java': 'package android.bluetooth; public class BluetoothAdapter { public static BluetoothAdapter getDefaultAdapter(){return new BluetoothAdapter();} public BluetoothDevice getRemoteDevice(String a){return new BluetoothDevice();} public java.util.Set<BluetoothDevice> getBondedDevices(){return java.util.Set.of();} }',
  'android/bluetooth/BluetoothDevice.java': `package android.bluetooth;
    public class BluetoothDevice {
      public static volatile java.util.concurrent.CountDownLatch entered, release;
      public static volatile BluetoothSocket last;
      public String getName(){return "Test";} public String getAddress(){return "00";}
      public BluetoothSocket createRfcommSocketToServiceRecord(java.util.UUID id) throws java.io.IOException {
        BluetoothSocket socket=new BluetoothSocket(); last=socket;
        if(entered!=null) { entered.countDown(); try { release.await(); } catch(InterruptedException ignored) { /* Deliberately finish creation after destruction. */ } }
        return socket;
      }
    }`,
  'android/bluetooth/BluetoothSocket.java': `package android.bluetooth; public class BluetoothSocket {
    public volatile boolean closed, connected;
    public void connect() throws java.io.IOException { if(closed) throw new java.io.IOException("Closed"); connected=true; }
    public void close() throws java.io.IOException { closed=true; connected=false; }
    public boolean isConnected(){return connected;}
    public java.io.OutputStream getOutputStream(){return new java.io.ByteArrayOutputStream();}
  }`,
  'com/getcapacitor/JSObject.java': 'package com.getcapacitor; public class JSObject extends java.util.HashMap<String,Object> {}',
  'com/getcapacitor/JSArray.java': 'package com.getcapacitor; public class JSArray extends java.util.ArrayList<Object> { public void put(Object o){add(o);} }',
  'com/getcapacitor/PermissionState.java': 'package com.getcapacitor; public enum PermissionState { GRANTED, DENIED }',
  'com/getcapacitor/Plugin.java': 'package com.getcapacitor; public class Plugin { public PermissionState getPermissionState(String a){return PermissionState.GRANTED;} public void requestPermissionForAlias(String a,PluginCall c,String cb){} protected void handleOnDestroy(){} }',
  'com/getcapacitor/PluginCall.java': `package com.getcapacitor; public class PluginCall {
    private final JSObject data=new JSObject(); public final java.util.concurrent.CountDownLatch done=new java.util.concurrent.CountDownLatch(1);
    public volatile String error; public volatile int resolutions;
    public PluginCall(){data.put("address","00");data.put("dataBase64","dGVzdA==");}
    public String getString(String k){return (String)data.get(k);} public int getInt(String k,int fallback){Object v=data.get(k);return v instanceof Number?((Number)v).intValue():fallback;}
    public JSObject getData(){return data;} public void reject(String s){error=s;done.countDown();} public void reject(String s,Exception e){reject(s);}
    public void resolve(){resolutions++;done.countDown();} public void resolve(JSObject o){resolve();}
  }`,
  'com/getcapacitor/PluginMethod.java': 'package com.getcapacitor; public @interface PluginMethod {}',
  'com/getcapacitor/annotation/Permission.java': 'package com.getcapacitor.annotation; public @interface Permission { String alias(); String[] strings(); }',
  'com/getcapacitor/annotation/PermissionCallback.java': 'package com.getcapacitor.annotation; public @interface PermissionCallback {}',
  'com/getcapacitor/annotation/CapacitorPlugin.java': 'package com.getcapacitor.annotation; public @interface CapacitorPlugin { String name(); Permission[] permissions(); }',
  'com/bahadoor/shopprint/ShopPrintPlugin.java': readFileSync(source, 'utf8'),
  'com/bahadoor/shopprint/LifecycleCheck.java': `package com.bahadoor.shopprint;
    import android.bluetooth.*; import com.getcapacitor.*; import java.util.concurrent.*;
    public class LifecycleCheck {
      static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
      static void rejected(PluginCall call) throws Exception {check(call.done.await(2,TimeUnit.SECONDS),"Call never settled");check(call.error!=null&&call.resolutions==0,"Canceled call resolved");}
      public static void main(String[] args) throws Exception {
        ShopPrintPlugin creating=new ShopPrintPlugin(); PluginCall connecting=new PluginCall();
        BluetoothDevice.entered=new CountDownLatch(1); BluetoothDevice.release=new CountDownLatch(1);
        try {
          creating.connectBluetooth(connecting); check(BluetoothDevice.entered.await(2,TimeUnit.SECONDS),"Creation not reached");
          creating.handleOnDestroy(); BluetoothDevice.release.countDown(); rejected(connecting);
          check(BluetoothDevice.last.closed&&!BluetoothDevice.last.connected,"Abandoned socket survived destruction");
          System.out.println("PASS destruction before socket publication");
        } finally {BluetoothDevice.release.countDown();creating.handleOnDestroy();BluetoothDevice.entered=null;}
        ShopPrintPlugin closed=new ShopPrintPlugin(); closed.handleOnDestroy(); PluginCall late=new PluginCall();
        closed.connectBluetooth(late); rejected(late); System.out.println("PASS fresh connection after destruction is rejected");
        ShopPrintPlugin printing=new ShopPrintPlugin(); PluginCall print=new PluginCall();
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        ScheduledThreadPoolExecutor scheduler=new ScheduledThreadPoolExecutor(1) {
          @Override public ScheduledFuture<?> schedule(Runnable task,long delay,TimeUnit unit) {
            entered.countDown();try{release.await();}catch(InterruptedException ignored){}
            throw new RejectedExecutionException("Destroyed while scheduling");
          }
        };
        java.lang.reflect.Field field=ShopPrintPlugin.class.getDeclaredField("deadlines");field.setAccessible(true);
        ((ScheduledExecutorService)field.get(printing)).shutdownNow();field.set(printing,scheduler);
        try {
          printing.printBluetooth(print);check(entered.await(2,TimeUnit.SECONDS),"Deadline not reached");
          printing.handleOnDestroy();release.countDown();rejected(print);
          System.out.println("PASS rejected deadline settles the call without escaping the worker");
        } finally {release.countDown();printing.handleOnDestroy();scheduler.shutdownNow();}
      }
    }`,
};
try {
  const inputs = Object.entries(files).map(([name, contents]) => {
    const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, contents); return path;
  });
  const executable = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
  for (const [name, args] of [['javac', ['-encoding', 'UTF-8', '-d', root, ...inputs]], ['java', ['-cp', root, 'com.bahadoor.shopprint.LifecycleCheck']]]) {
    const result = spawnSync(executable(name), args, { encoding: 'utf8', timeout: 20_000 });
    process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
    if (result.error || result.status !== 0) throw new Error(result.error?.message ?? name + ' failed');
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
