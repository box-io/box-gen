# box-gen

> Configures Eclipse CDT project settings using `box` configuration files.

## Install

```bash
npm install -g box-gen
```

In Eclipse enable `Preferences > General > Workspace > Refresh using native hooks or polling`. Otherwise, after running `box-gen` the IDE will not immediately take up the changesto `.cproject`. 

### Windows

- `npm install -g gulp`
- Install Visual Studio 2015 Community Edition.
  *IMPORTANT: C++ will not automatically be installed. Make sure to select it manually during installation.*

## Usage

```bash
$ cd <eclipse-cdt-project-dir>
$ box-gen
```

## License

[MIT](http://vjpr.mit-license.org)
