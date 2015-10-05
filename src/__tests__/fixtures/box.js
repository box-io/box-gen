module.exports = {

  root: true,

  configurations: {

    buildTestGoogleTest: {
      includes: ['modules/gtest'],
      excludes: ['libs', 'src', 'modules/CppUTest', 'modules/foo', 'modules/duktape'],
    },

    buildDebugF411: {},

    buildDebugF405: {
      defs: ['STM32F405xx']
    },

    buildTestCppUTest: {
      defs: [
        'CPPUTEST_USE_STD_CPP_LIB=0',
      ]
    },

    all: {

      includePaths: [
        // Existing includes.
        'libs/system/include',
        'libs/system/include/stm32f4-hal/Legacy',
        'src/drivers/usb',
        'libs/system/include/cmsis',
        'libs/system/include/stm32f4-hal',
        'src/drivers/xxx/compiler',
        'src/drivers/xxx/decadriver',
        'src/drivers/xxx/platform',
        'src/drivers/xxx/sys',
        'src/drivers/xxx/application',
        'libs/system/include/diag',
        'libs/lmfit',
        'libs/FreeRTOS/portable/MemMang',
        'libs/STM32_USB_Device_Library/Class/CDC/Inc',
        'libs/STM32_USB_Device_Library/Core/Inc',
        'src/drivers/yyy/compiler',
        'src/drivers/yyy/decadriver',
        'src/drivers/yyy/platform',
        'src/drivers/yyy/sys',
        'src/drivers/yyy/application',
        'src/fusion/inc',
        'libs/alglib',
        'src/protocol',
        'libs/nanopb',
        'src/settings',
        //'modules/FreeRTOS/portable/GCC/ARM_CM4F',
      ],
      defs: [
        'STM32F411xE',
        'DEBUG',
        'USE_FULL_ASSERT',
        'USE_HAL_DRIVER',
        'HSE_VALUE=8000000',
        'USE_DEVICE_MODE',
        'USE_USB_OTG_FS',
      ],
      includes: [
        'modules/FreeRTOS/portable/MemMang/heap_1.c',
        'modules/FreeRTOS/portable/GCC/ARM_CM4F/port.c',

        'libs/system/src/newlib',

      ],
      templates: [
        // TODO(vjpr): Review.
        'libs/STM32_USB_Device_Library/Class/CDC/Src/usbd_cdc_if_template.c',
        'libs/STM32_USB_Device_Library/Core/Src/usbd_conf_template.c',
        'libs/stm32usb/Class/MSC/Src/usbd_msc_storage_template.c',
        'libs/stm32usb/Class/CDC/Src/usbd_cdc_if_template.c',
        'libs/stm32usb/Core/Src/usbd_conf_template.c',
      ],
      excludes: [

        // Build dirs.
        // TODO(vjpr): Automatically exclude in box-gen.
        'buildDebugF411',
        'buildDebugF405',
        'buildRelease',
        'buildTest',
        'buildTestCatch',
        'buildTestCppUTest',

        // Tests.
        'modules/gtest',
        'modules/CppUTest',

        // DEBUG
        'modules/foo',

        // Obsolete.
        // TODO(vjpr): This should be removed from codebase.
        'modules/obsolete',

        //  These don't exist anymore.
        // 'libs/USB/STM32_USB_Device_Library/Class/audio',
        // 'libs/USB/STM32_USB_OTG_Driver/src/usb_otg.c',
        // 'libs/USB/STM32_USB_Device_Library/Class/dfu',
        // 'libs/USB/STM32_USB_Device_Library/Class/hid',
        // 'libs/USB/STM32_USB_Device_Library/Class/msc',
        // 'libs/USB/STM32_USB_OTG_Driver/src/usb_hcd.c',
        // 'libs/USB/STM32_USB_OTG_Driver/src/usb_hcd_int.c',

        'libs/system/src/newlib/assert.c',
        'modules/decawave/sys/syscalls.c',
        'modules/usb/usbd_storage_if.c',

        // TODO(vjpr): Migrate all drivers to mbed.
        'modules/mbed-rpc',

        // mbed
        // off
        'modules/mbed',
        // on
        // 'libs/system/src/stm32f4-hal',
        // 'modules/mbed/targets/cmsis/TARGET_STM/TARGET_STM32F4/TARGET_NUCLEO_F411RE/TOOLCHAIN_GCC_ARM/startup_stm32f411xe.S',
        // 'modules/mbed/targets/cmsis/TARGET_STM/TARGET_STM32F4/TARGET_NUCLEO_F411RE/system_stm32f4xx.c',
        // 'modules/mbed/common/retarget.cpp',


      ],
    }

  }

}
