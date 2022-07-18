# TASK SITE

## Demo
- Site: [site.task.julian.im](https://site.task.julian.im)
- Uptime: [uptime.task.julian.im](https://uptime.task.julian.im)

> Please note you might get a warning on your browser about the site redirecting to https.

## Setup

### Dependencies
- Python 3.8+
- Node.js 14+

Install Go Task
```bash
$ brew install go-task/tap/go-task
```

Install dev tools
```bash
$ task install-dev
```

### Usage
List the available tasks with their descriptions:
```bash
$ task list

task: Available tasks for this project:
* build: 	Build image
* deploy: 	Deploy infrastructure
* install-dev: 	Install development dependencies
* kill: 	Kill container
* print: 	Print all variables
* push: 	Push image
* run: 		Spin container and tail logs
* spin: 	Spin container
* tail: 	Tail logs
* test: 	Run tests
```

Call each task like so:
```bash
$ task run
$ task test
$ task deploy
```
