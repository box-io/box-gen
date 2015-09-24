# Eclipse Generator

Generates an Eclipse project.

## XML parser options

    Options

    xml2js - 1177
    libxmljs - 474
    xml2json - 212
    xmldom - 175
    xml-stream - 99
    xmldoc - 84
    node-jsxml - 12

## Code style

Javascript style naming
Java style braces
NPM modules should have postfix `.box`

## Directory structure

The only ugly thing is the name of the `node_modules` directory. We could symlink it but that just adds complexity. Just go with it!

- Emphasis on flatness and modularity
- Predictable/obvious
- Easy to monkey-patch/override modules
- SEMVER!
- Easy to disable functionality
- Transparent - you should be able to see all the code generators at work and have control over them
- We want to make as least changes possible to external 3rd party libs because that will add maintenance.
  The only thing we want to add is a box.json file in the root.
- .h and .cpp in the same directory

```
node_modules // Modules hosted on NPM (do not modify anything in here - it is managed by npm)
  // Box libs
  cmsis.box
  fatfs.box
  stm32usb.box
  freertos.box
  freertos-plus-cli.box
  freertos-plus-trace.box
  rs9113.box
  stm32hal.box
  mbed4stm32.box
  heatshrink.box
  ascii-support.box
  // Node.js Helpers
  box

modules // Your modules. Create a new module to help you organise your code or if you think it could be published on npm at a later time. A module is a collection of functionality that should be able to be removed and not break the system.
  tracktics-board // Generated from IOC
    pins.h // C++ file of pins to peripherals
    // Linker scripts
    // TODO: Would be better to not have a directory here.
    // Linker is MCU and Compiler/IDE dependent
    // Linker scripts should be generated, or should exist for all compilers.
    // Some other shit is Compiler dependent too. Needs more thought.
    linker
      linker.ld
    interrupts.h // All weak interrupts
  sync
  compressor
  app
    tasks // Rails style grouping of classes by type. I don't like this and prefer grouping by functionality, but it is more obvious.
  console.box
generators // Anything that generates code.
  // Contains all code related to code generation.
  generator.ts // Code used to generate.

// Configuration files for modules and project - file names should match the module.
// TODO: Maybe its better if all the config is done in a single .cpp file - this would be more Node.js style.
config
  debug.h // Debugging settings. Also, printf settings, etc.
  app.h // global.h maybe? App specific config settings. Might also be better to match these to modules. E.g. sync.h.
  board.h // Maybe a single file with everything about the board instead of submodule. Maybe this could point to the board module.
  freertos.h
  stm32hal.h
  fatfs.h
  stm32usb.h
  box.ts // Configures box project generation.
  cube.ioc // STM32CubeMX file.
  openocd
project // Project files - supports multiple ones
  eclipse
    launch // Launch configurations
    build // TODO: Not sure if this should be `/build/eclipse` instead.
      Debug
      Release
  keil
  cmake
    CMakeLists.txt
main.cpp
package.json
.gitignore
```

## Configs

Many types of configs

- .h
- .ts - generates C/C++ code, defines, etc
- .cpp - C++ class config

## Box Module

package.json
box.ts
  - Provide options for which files need to be included
  - Which files should be excluded (excluded from build and from IDE)

## Include resolution

NOTE: For new libs use relative referencing from modules dir. 

Check `/config/box.ts` (Maybe change to `/box.ts`) and add includes/excludes from here.
Make a list of disabled modules.
Search for box.ts or box.json files in `modules` and `node_modules` recursively.
Generate warnings if required options have not been selected for modules.

optional requires are made for displaying errors really.

# Board

What is a board?

A board has an MCU, which has pins connected to communication interfaces (implementing protocols), which communicate with modules/ICs/devices.

User code should use interfaces to send commands to peripheral devices.

Modules should have
