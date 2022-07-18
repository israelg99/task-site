import { useState } from "react"

import axios from "axios"

import logo from './vista-path-full.png'
import cassette from './full-cassette.jpeg'
import './App.css'


function App() {

  const [boxes, setBoxes] = useState([])

  const image = new Image()
  image.src = cassette

  const getBoundingBoxes = event => {
    const requestData = new FormData()
    requestData.append("file", event.target.files[0])
    axios.put("https://api.task.julian.im/", requestData).then(result => {
      const { boxes=[], errors }  = result.data
      setBoxes(boxes.map(box => {
        const height = box.y_off * image.height
        const width = box.x_off * image.width
        const left = box.x1 * image.width
        const top = box.y1 * image.height
        return { height, width, left, top }
      }))
      console.log("CV Errors: ", errors)
    })
  }

  return (
    <div>
      <header>
        <img src={logo} className="logo" alt="logo" />
      </header>
      <div className="overlap-container">
        <div className="img-container">
          <img src={cassette} className="overlap" alt="cassette" style={{ height: image.height }} />
          {boxes.map((box, index) => (
            <div key={index} className="overlap box" style={{ ...box }}></div>
          ))}
        </div>
      </div>
      <div className="buttons" style={{ marginTop: image.height + 20 }}>
        <label for="cassetteUpload" style={{ display: "block" }}>Upload File and Get Bounding Boxes</label>
        <input type="file" name="cassette" id="cassetteUpload" onChange={getBoundingBoxes} style={{ marginTop: 20 }} />
      </div>
    </div>
  )

}

export default App
